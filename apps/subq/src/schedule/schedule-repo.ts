import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { SqlClient } from 'effect/unstable/sql'

import {
  DoseMg,
  Frequency,
  MedicationCompound,
  Supplier,
  InjectionSchedule,
  InjectionScheduleId,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleDatabaseError,
  ScheduleName,
  ScheduleNotFoundError,
  SchedulePhase,
  SchedulePhaseId,
} from '#shared'
import type { InjectionScheduleCreate, InjectionScheduleUpdate, SchedulePhaseCreate } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

// ============================================
// Database Row Schemas
// ============================================

export const ScheduleRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Schema.String),
  frequency: Frequency,
  start_date: Schema.String,
  is_active: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})
export type ScheduleRow = typeof ScheduleRow.Type

const DatetimeRow = Schema.Struct({
  datetime: Schema.String,
})
const decodeDatetimeRow = Schema.decodeUnknownEffect(DatetimeRow)

export const PhaseRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.String,
  order: PhaseOrder,
  duration_days: Schema.NullOr(PhaseDurationDays),
  dose_mg: DoseMg,
  created_at: Schema.String,
  updated_at: Schema.String,
})
export type PhaseRow = typeof PhaseRow.Type

// Schema for joined schedule + phase rows (single query with LEFT JOIN)
const ScheduleWithPhaseRow = Schema.Struct({
  // Schedule fields
  id: Schema.String,
  name: Schema.String,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Schema.String),
  frequency: Frequency,
  start_date: Schema.String,
  is_active: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  // Phase fields (nullable for schedules with no phases)
  phase_id: Schema.NullOr(Schema.String),
  phase_schedule_id: Schema.NullOr(Schema.String),
  phase_order: Schema.NullOr(PhaseOrder),
  phase_duration_days: Schema.NullOr(PhaseDurationDays),
  phase_dose_mg: Schema.NullOr(DoseMg),
  phase_created_at: Schema.NullOr(Schema.String),
  phase_updated_at: Schema.NullOr(Schema.String),
})

const decodeScheduleRow = Schema.decodeUnknownEffect(ScheduleRow)
const decodePhaseRow = Schema.decodeUnknownEffect(PhaseRow)
const decodeScheduleWithPhaseRow = Schema.decodeUnknownEffect(ScheduleWithPhaseRow)

export const phaseRowToDomain = (row: typeof PhaseRow.Type): SchedulePhase =>
  new SchedulePhase({
    id: SchedulePhaseId.make(row.id),
    scheduleId: InjectionScheduleId.make(row.schedule_id),
    order: row.order,
    durationDays: row.duration_days,
    doseMg: row.dose_mg,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

export const scheduleRowToDomain = (row: typeof ScheduleRow.Type, phases: SchedulePhase[]): InjectionSchedule =>
  new InjectionSchedule({
    id: InjectionScheduleId.make(row.id),
    name: ScheduleName.make(row.name),
    drug: row.drug,
    supplier: row.supplier !== null && Str.isNonEmpty(row.supplier) ? Supplier.make(row.supplier) : null,
    frequency: row.frequency,
    startDate: DateTime.makeUnsafe(row.start_date),
    isActive: row.is_active === 1,
    notes: row.notes !== null && Str.isNonEmpty(row.notes) ? Notes.make(row.notes) : null,
    phases,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

// Extract a phase from a joined row (LEFT JOIN may return null phase columns)
const joinedRowToPhase = (row: typeof ScheduleWithPhaseRow.Type): Option.Option<SchedulePhase> => {
  if (
    row.phase_id === null ||
    row.phase_schedule_id === null ||
    row.phase_order === null ||
    row.phase_dose_mg === null ||
    row.phase_created_at === null ||
    row.phase_updated_at === null
  ) {
    return Option.none()
  }

  return Option.some(
    new SchedulePhase({
      id: SchedulePhaseId.make(row.phase_id),
      scheduleId: InjectionScheduleId.make(row.phase_schedule_id),
      order: row.phase_order,
      durationDays: row.phase_duration_days,
      doseMg: row.phase_dose_mg,
      createdAt: DateTime.makeUnsafe(row.phase_created_at),
      updatedAt: DateTime.makeUnsafe(row.phase_updated_at),
    })
  )
}

const joinedRowToScheduleRow = (row: typeof ScheduleWithPhaseRow.Type): typeof ScheduleRow.Type => ({
  id: row.id,
  name: row.name,
  drug: row.drug,
  supplier: row.supplier,
  frequency: row.frequency,
  start_date: row.start_date,
  is_active: row.is_active,
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

// Helper to group joined rows into schedules with phases (avoids N+1 queries)
const groupSchedulesWithPhases = (rows: Array<typeof ScheduleWithPhaseRow.Type>): InjectionSchedule[] => {
  const grouped = Arr.groupBy(rows, (row) => row.id)

  return Arr.map(R.values(grouped), (group) => {
    const schedule = joinedRowToScheduleRow(Arr.headNonEmpty(group))
    const phases = Arr.getSomes(Arr.map(group, joinedRowToPhase))
    return scheduleRowToDomain(schedule, phases)
  })
}

// ============================================
// Repository Service Definition
// ============================================

export class ScheduleRepo extends Context.Service<
  ScheduleRepo,
  {
    readonly list: (userId: string) => Effect.Effect<InjectionSchedule[], ScheduleDatabaseError>
    readonly getActive: (userId: string) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly findById: (
      id: string,
      userId: string
    ) => Effect.Effect<Option.Option<InjectionSchedule>, ScheduleDatabaseError>
    readonly create: (
      data: InjectionScheduleCreate,
      userId: string
    ) => Effect.Effect<InjectionSchedule, ScheduleDatabaseError>
    readonly update: (
      data: InjectionScheduleUpdate,
      userId: string
    ) => Effect.Effect<InjectionSchedule, ScheduleNotFoundError | ScheduleDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, ScheduleDatabaseError>
    readonly getLastInjectionDate: (
      userId: string,
      drug: MedicationCompound
    ) => Effect.Effect<Option.Option<DateTime.Utc>, ScheduleDatabaseError>
  }
>()('@garage/subq/schedule/schedule-repo/ScheduleRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const ScheduleRepoLive = Layer.effect(
  ScheduleRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Helper to load phases for a single schedule (used for create/update)
    const loadPhases = Effect.fn('ScheduleRepo.loadPhases')(function* (scheduleId: string) {
      const rows = yield* sql`
          SELECT id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at
          FROM schedule_phases
          WHERE schedule_id = ${scheduleId}
          ORDER BY "order" ASC
        `
      const decoded = yield* Effect.all(
        rows.map((r) => decodePhaseRow(r)),
        { concurrency: 1 }
      )
      return decoded.map(phaseRowToDomain)
    })

    // Helper to create phases for a schedule
    const createPhases = Effect.fn('ScheduleRepo.createPhases')(function* (
      scheduleId: string,
      phases: readonly SchedulePhaseCreate[]
    ) {
      const now = DateTime.formatIso(yield* DateTime.now)
      yield* Effect.forEach(
        phases,
        (phase) =>
          randomUuid().pipe(
            Effect.flatMap(
              (phaseId) => sql`
            INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at)
            VALUES (${phaseId}, ${scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.doseMg}, ${now}, ${now})
          `
            )
          ),
        { concurrency: 1 }
      )
    })

    // Helper to delete phases for a schedule
    const deletePhases = (scheduleId: string) => sql`DELETE FROM schedule_phases WHERE schedule_id = ${scheduleId}`

    // Single query to fetch schedules with phases using LEFT JOIN
    const list = Effect.fn('ScheduleRepo.list')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dose_mg as phase_dose_mg,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.user_id = ${userId}
          ORDER BY s.start_date DESC, p."order" ASC
        `
        const decoded = yield* Effect.all(
          rows.map((r) => decodeScheduleWithPhaseRow(r)),
          { concurrency: 1 }
        )
        return groupSchedulesWithPhases(decoded)
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    // Single query to fetch active schedule with phases using LEFT JOIN
    const getActive = Effect.fn('ScheduleRepo.getActive')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dose_mg as phase_dose_mg,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.user_id = ${userId} AND s.is_active = 1
          ORDER BY p."order" ASC
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* Effect.all(
          rows.map((r) => decodeScheduleWithPhaseRow(r)),
          { concurrency: 1 }
        )
        const schedules = groupSchedulesWithPhases(decoded)
        return Option.fromNullishOr(schedules[0])
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    // Single query to fetch schedule by ID with phases using LEFT JOIN
    const findById = Effect.fn('ScheduleRepo.findById')(
      function* (id: string, userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dose_mg as phase_dose_mg,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.id = ${id} AND s.user_id = ${userId}
          ORDER BY p."order" ASC
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* Effect.all(
          rows.map((r) => decodeScheduleWithPhaseRow(r)),
          { concurrency: 1 }
        )
        const schedules = groupSchedulesWithPhases(decoded)
        return Option.fromNullishOr(schedules[0])
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    const create = Effect.fn('ScheduleRepo.create')(
      function* (data: InjectionScheduleCreate, userId: string) {
        const id = yield* randomUuid()
        const supplier = Option.getOrNull(data.supplier)
        const notes = Option.getOrNull(data.notes)
        const now = DateTime.formatIso(yield* DateTime.now)
        const startDateStr = DateTime.formatIso(data.startDate)

        // Deactivate any existing active schedules for this user
        yield* sql`UPDATE injection_schedules SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`

        // Create the schedule
        yield* sql`
          INSERT INTO injection_schedules (id, name, drug, supplier, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
          VALUES (${id}, ${data.name}, ${data.drug}, ${supplier}, ${data.frequency}, ${startDateStr}, 1, ${notes}, ${userId}, ${now}, ${now})
        `

        // Create phases
        yield* createPhases(id, data.phases)

        // Fetch and return
        const rows = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${id}
        `
        const decoded = yield* decodeScheduleRow(rows[0])
        const phases = yield* loadPhases(id)
        return scheduleRowToDomain(decoded, phases)
      },
      mapDbError(ScheduleDatabaseError, 'insert')
    )

    const update = Effect.fn('ScheduleRepo.update')(function* (data: InjectionScheduleUpdate, userId: string) {
      // First get current values - include user_id check to prevent IDOR
      const current = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, is_active, notes, user_id, created_at, updated_at
          FROM injection_schedules WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(ScheduleDatabaseError, 'query'))

      if (Arr.isReadonlyArrayEmpty(current)) {
        return yield* Effect.fail(ScheduleNotFoundError.make({ id: data.id }))
      }

      const curr = yield* decodeScheduleRow(current[0]).pipe(mapDbError(ScheduleDatabaseError, 'query'))

      const newName = data.name ?? curr.name
      const newDrug = data.drug ?? curr.drug
      const newSupplier = data.supplier !== undefined ? data.supplier : curr.supplier
      const newFrequency = data.frequency ?? curr.frequency
      const newStartDate = data.startDate !== undefined ? DateTime.formatIso(data.startDate) : curr.start_date
      const newIsActive = data.isActive ?? curr.is_active === 1
      const newNotes = data.notes !== undefined ? data.notes : curr.notes
      const now = DateTime.formatIso(yield* DateTime.now)

      // If activating this schedule, deactivate others
      if (newIsActive && curr.is_active !== 1) {
        yield* sql`
            UPDATE injection_schedules SET is_active = 0, updated_at = ${now}
            WHERE user_id = ${userId} AND is_active = 1 AND id != ${data.id}
          `.pipe(mapDbError(ScheduleDatabaseError, 'update'))
      }

      yield* sql`
          UPDATE injection_schedules
          SET name = ${newName},
              drug = ${newDrug},
              supplier = ${newSupplier},
              frequency = ${newFrequency},
              start_date = ${newStartDate},
              is_active = ${newIsActive ? 1 : 0},
              notes = ${newNotes},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(ScheduleDatabaseError, 'update'))

      // Update phases if provided
      if (data.phases !== undefined) {
        yield* deletePhases(data.id).pipe(mapDbError(ScheduleDatabaseError, 'delete'))
        yield* createPhases(data.id, data.phases).pipe(mapDbError(ScheduleDatabaseError, 'insert'))
      }

      // Fetch updated
      const rows = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(ScheduleDatabaseError, 'query'))

      const decoded = yield* decodeScheduleRow(rows[0]).pipe(mapDbError(ScheduleDatabaseError, 'query'))
      const phases = yield* loadPhases(data.id).pipe(mapDbError(ScheduleDatabaseError, 'query'))
      return scheduleRowToDomain(decoded, phases)
    })

    const del = Effect.fn('ScheduleRepo.delete')(
      function* (id: string, userId: string) {
        const existing = yield* sql`SELECT id FROM injection_schedules WHERE id = ${id} AND user_id = ${userId}`
        if (Arr.isReadonlyArrayEmpty(existing)) {
          return false
        }
        // Phases are deleted via CASCADE
        yield* sql`DELETE FROM injection_schedules WHERE id = ${id} AND user_id = ${userId}`
        return true
      },
      mapDbError(ScheduleDatabaseError, 'delete')
    )

    const getLastInjectionDate = Effect.fn('ScheduleRepo.getLastInjectionDate')(
      function* (userId: string, drug: MedicationCompound) {
        const rows = yield* sql`
          SELECT datetime FROM injection_logs
          WHERE user_id = ${userId} AND drug = ${drug}
          ORDER BY datetime DESC
          LIMIT 1
        `
        const [row] = rows
        if (row === undefined) {
          return Option.none()
        }
        const decoded = yield* decodeDatetimeRow(row)
        return Option.some(DateTime.makeUnsafe(decoded.datetime))
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    return {
      list,
      getActive,
      findById,
      create,
      update,
      delete: del,
      getLastInjectionDate,
    }
  })
)
