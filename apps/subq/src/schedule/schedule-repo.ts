import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'

import { ScheduleDatabaseError, ScheduleNotFoundError, SettingsTimezoneNotInitialized } from '#shared'
import type {
  InjectionScheduleCreate,
  InjectionScheduleUpdate,
  SchedulePhaseCreate,
  MedicationCompound,
  InjectionSchedule,
} from '#shared'

import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'
import {
  DatetimeRow,
  groupSchedulesWithPhases,
  PhaseRow,
  phaseRowToDomain,
  ScheduleRow,
  scheduleRowToDomain,
  ScheduleWithPhaseRow,
} from './schedule-rows.js'

const decodeDatetimeRow = Schema.decodeUnknownEffect(DatetimeRow)
const decodeScheduleRow = Schema.decodeUnknownEffect(ScheduleRow)
const decodePhaseRow = Schema.decodeUnknownEffect(PhaseRow)
const decodeScheduleWithPhaseRow = Schema.decodeUnknownEffect(ScheduleWithPhaseRow)

// ============================================
// Repository Service Definition
// ============================================

export class ScheduleRepo extends Context.Service<
  ScheduleRepo,
  {
    readonly list: (userId: string) => Effect.Effect<Array<InjectionSchedule>, ScheduleDatabaseError>
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
    ) => Effect.Effect<
      InjectionSchedule,
      ScheduleNotFoundError | ScheduleDatabaseError | SettingsTimezoneNotInitialized
    >
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
    const loadPhases = Effect.fn('scheduleRepo.loadPhases')(function* (scheduleId: string) {
      const rows = yield* sql`
          SELECT id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at
          FROM schedule_phases
          WHERE schedule_id = ${scheduleId}
          ORDER BY "order" ASC
        `

      const decoded = yield* Effect.forEach(rows, (r) => decodePhaseRow(r), { concurrency: 1 })

      return Arr.map(decoded, phaseRowToDomain)
    })

    // Helper to create phases for a schedule
    const createPhases = Effect.fn('scheduleRepo.createPhases')(function* (
      scheduleId: string,
      phases: ReadonlyArray<SchedulePhaseCreate>
    ) {
      const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
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
    const list = Effect.fn('scheduleRepo.list')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.calendar_date_migrated,
            s.is_active, s.notes, s.created_at, s.updated_at,
            p.id as phase_id, p.schedule_id as phase_schedule_id, p."order" as phase_order,
            p.duration_days as phase_duration_days, p.dose_mg as phase_dose_mg,
            p.created_at as phase_created_at, p.updated_at as phase_updated_at
          FROM injection_schedules s
          LEFT JOIN schedule_phases p ON s.id = p.schedule_id
          WHERE s.user_id = ${userId}
          ORDER BY s.start_date DESC, p."order" ASC
        `

        const decoded = yield* Effect.forEach(rows, (r) => decodeScheduleWithPhaseRow(r), { concurrency: 1 })

        return groupSchedulesWithPhases(decoded)
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    // Single query to fetch active schedule with phases using LEFT JOIN
    const getActive = Effect.fn('scheduleRepo.getActive')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.calendar_date_migrated,
            s.is_active, s.notes, s.created_at, s.updated_at,
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

        const decoded = yield* Effect.forEach(rows, (r) => decodeScheduleWithPhaseRow(r), { concurrency: 1 })

        const schedules = groupSchedulesWithPhases(decoded)

        return Option.fromNullishOr(schedules[0])
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    // Single query to fetch schedule by ID with phases using LEFT JOIN
    const findById = Effect.fn('scheduleRepo.findById')(
      function* (id: string, userId: string) {
        const rows = yield* sql`
          SELECT
            s.id, s.name, s.drug, s.supplier, s.frequency, s.start_date, s.calendar_date_migrated,
            s.is_active, s.notes, s.created_at, s.updated_at,
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

        const decoded = yield* Effect.forEach(rows, (r) => decodeScheduleWithPhaseRow(r), { concurrency: 1 })

        const schedules = groupSchedulesWithPhases(decoded)

        return Option.fromNullishOr(schedules[0])
      },
      mapDbError(ScheduleDatabaseError, 'query')
    )

    const create = Effect.fn('scheduleRepo.create')(
      function* (data: InjectionScheduleCreate, userId: string) {
        const id = yield* randomUuid()
        const supplier = Option.getOrNull(data.supplier)
        const notes = Option.getOrNull(data.notes)
        const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
        const { startDate } = data

        // Deactivate any existing active schedules for this user
        yield* sql`UPDATE injection_schedules SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`

        // Create the schedule
        yield* sql`
          INSERT INTO injection_schedules (
            id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
            is_active, notes, user_id, created_at, updated_at
          )
          VALUES (${id}, ${data.name}, ${data.drug}, ${supplier}, ${data.frequency}, ${startDate}, 1, 1, ${notes}, ${userId}, ${now}, ${now})
        `

        // Create phases
        yield* createPhases(id, data.phases)

        // Fetch and return
        const rows = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
                 is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${id}
        `

        const decoded = yield* decodeScheduleRow(rows[0])
        const phases = yield* loadPhases(id)

        return scheduleRowToDomain(decoded, phases)
      },
      mapDbError(ScheduleDatabaseError, 'insert')
    )

    const update = Effect.fn('scheduleRepo.update')(function* (data: InjectionScheduleUpdate, userId: string) {
      // First get current values - include user_id check to prevent IDOR
      const current = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
                 is_active, notes, user_id, created_at, updated_at
          FROM injection_schedules WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(ScheduleDatabaseError, 'query'))

      if (Arr.isReadonlyArrayEmpty(current)) {
        return yield* Effect.fail(ScheduleNotFoundError.make({ id: data.id }))
      }

      const curr = yield* decodeScheduleRow(current[0]).pipe(mapDbError(ScheduleDatabaseError, 'query'))
      const changesStartDate = data.startDate !== undefined

      if (changesStartDate) {
        const initializedSettings = yield* sql`
          SELECT user_id FROM user_settings
          WHERE user_id = ${userId}
            AND timezone IS NOT NULL
            AND timezone_migration_state = 'complete'
        `.pipe(mapDbError(ScheduleDatabaseError, 'query'))

        if (curr.calendar_date_migrated !== 1 || Arr.isReadonlyArrayEmpty(initializedSettings)) {
          return yield* SettingsTimezoneNotInitialized.make({ userId })
        }
      }

      const newName = data.name ?? curr.name
      const newDrug = data.drug ?? curr.drug
      const newSupplier = data.supplier === undefined ? curr.supplier : data.supplier
      const newFrequency = data.frequency ?? curr.frequency
      const newIsActive = data.isActive ?? curr.is_active === 1
      const newNotes = data.notes === undefined ? curr.notes : data.notes
      const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))

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
              start_date = CASE
                WHEN ${changesStartDate ? 1 : 0} = 1 THEN ${data.startDate ?? null}
                ELSE start_date
              END,
              calendar_date_migrated = CASE
                WHEN ${changesStartDate ? 1 : 0} = 1 THEN 1
                ELSE calendar_date_migrated
              END,
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
          SELECT id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
                 is_active, notes, created_at, updated_at
          FROM injection_schedules
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(ScheduleDatabaseError, 'query'))

      const decoded = yield* decodeScheduleRow(rows[0]).pipe(mapDbError(ScheduleDatabaseError, 'query'))
      const phases = yield* loadPhases(data.id).pipe(mapDbError(ScheduleDatabaseError, 'query'))

      return scheduleRowToDomain(decoded, phases)
    })

    const del = Effect.fn('scheduleRepo.delete')(
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

    const getLastInjectionDate = Effect.fn('scheduleRepo.getLastInjectionDate')(
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
