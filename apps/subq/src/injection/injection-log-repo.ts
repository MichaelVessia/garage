import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { SqlClient } from 'effect/unstable/sql'

import {
  DoseMg,
  MedicationCompound,
  Supplier,
  InjectionLog,
  InjectionLogDatabaseError,
  InjectionLogId,
  InjectionLogNotFoundError,
  InjectionScheduleId,
  InjectionSite,
  Notes,
} from '#shared'
import type { InjectionLogCreate, InjectionLogListParams, InjectionLogUpdate } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from SQLite
// (snake_case columns, ISO strings for dates)
export const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Schema.String),
  dose_mg: DoseMg,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  schedule_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})
export type InjectionLogRow = typeof InjectionLogRow.Type

const decodeRow = Schema.decodeUnknownEffect(InjectionLogRow)

// Schemas for simple aggregation queries
const InjectionSiteRow = Schema.Struct({ injection_site: Schema.String })
const decodeSiteRows = Schema.decodeUnknownEffect(Schema.Array(InjectionSiteRow))

const LastSiteRow = Schema.Struct({ injection_site: Schema.NullOr(Schema.String) })
const decodeLastSiteRows = Schema.decodeUnknownEffect(Schema.Array(LastSiteRow))

// Transform DB row to domain object using branded type constructors
export const rowToDomain = (row: typeof InjectionLogRow.Type): InjectionLog =>
  new InjectionLog({
    id: InjectionLogId.make(row.id),
    datetime: DateTime.makeUnsafe(row.datetime),
    drug: row.drug,
    supplier: row.supplier !== null && Str.isNonEmpty(row.supplier) ? Supplier.make(row.supplier) : null,
    doseMg: row.dose_mg,
    injectionSite:
      row.injection_site !== null && Str.isNonEmpty(row.injection_site) ? InjectionSite.make(row.injection_site) : null,
    notes: row.notes !== null && Str.isNonEmpty(row.notes) ? Notes.make(row.notes) : null,
    scheduleId:
      row.schedule_id !== null && Str.isNonEmpty(row.schedule_id) ? InjectionScheduleId.make(row.schedule_id) : null,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// ============================================
// Repository Service Definition
// ============================================

export class InjectionLogRepo extends Context.Service<
  InjectionLogRepo,
  {
    readonly list: (
      params: InjectionLogListParams,
      userId: string
    ) => Effect.Effect<InjectionLog[], InjectionLogDatabaseError>
    readonly findById: (
      id: string,
      userId: string
    ) => Effect.Effect<Option.Option<InjectionLog>, InjectionLogDatabaseError>
    readonly create: (
      data: InjectionLogCreate,
      userId: string
    ) => Effect.Effect<InjectionLog, InjectionLogDatabaseError>
    readonly update: (
      data: InjectionLogUpdate,
      userId: string
    ) => Effect.Effect<InjectionLog, InjectionLogNotFoundError | InjectionLogDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, InjectionLogDatabaseError>
    readonly getUniqueSites: (userId: string) => Effect.Effect<string[], InjectionLogDatabaseError>
    readonly getLastSite: (userId: string) => Effect.Effect<Option.Option<string>, InjectionLogDatabaseError>
    readonly listBySchedule: (
      scheduleId: string,
      userId: string
    ) => Effect.Effect<InjectionLog[], InjectionLogDatabaseError>
  }
>()('@garage/subq/injection/injection-log-repo/InjectionLogRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const InjectionLogRepoLive = Layer.effect(
  InjectionLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = Effect.fn('InjectionLogRepo.list')(
      function* (params: InjectionLogListParams, userId: string) {
        // Convert DateTime params to ISO strings for SQLite comparison
        const startDateStr = params.startDate !== undefined ? DateTime.formatIso(params.startDate) : undefined
        const endDateStr = params.endDate !== undefined ? DateTime.formatIso(params.endDate) : undefined

        const rows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          ${params.drug !== undefined ? sql`AND drug = ${params.drug}` : sql``}
          ORDER BY datetime DESC
          LIMIT ${params.limit}
          OFFSET ${params.offset}
        `
        const results = yield* Effect.all(rows.map(decodeAndTransform), { concurrency: 1 })
        return results
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    const findById = Effect.fn('InjectionLogRepo.findById')(
      function* (id: string, userId: string) {
        const rows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${id} AND user_id = ${userId}
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeAndTransform(rows[0])
        return Option.some(decoded)
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    const create = Effect.fn('InjectionLogRepo.create')(
      function* (data: InjectionLogCreate, userId: string) {
        const id = yield* randomUuid()
        const supplier = Option.isSome(data.supplier) ? data.supplier.value : null
        const injectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : null
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const scheduleId = Option.isSome(data.scheduleId) ? data.scheduleId.value : null
        const now = DateTime.formatIso(yield* DateTime.now)
        const datetimeStr = DateTime.formatIso(data.datetime)

        yield* sql`
          INSERT INTO injection_logs (id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, user_id, created_at, updated_at)
          VALUES (${id}, ${datetimeStr}, ${data.drug}, ${supplier}, ${data.doseMg}, ${injectionSite}, ${notes}, ${scheduleId}, ${userId}, ${now}, ${now})
        `

        // Fetch the inserted row
        const rows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${id}
        `
        return yield* decodeAndTransform(rows[0])
      },
      mapDbError(InjectionLogDatabaseError, 'insert')
    )

    const update = Effect.fn('InjectionLogRepo.update')(function* (data: InjectionLogUpdate, userId: string) {
      // First get current values - include user_id check to prevent IDOR
      const current = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(InjectionLogDatabaseError, 'query'))

      if (Arr.isReadonlyArrayEmpty(current)) {
        return yield* Effect.fail(InjectionLogNotFoundError.make({ id: data.id }))
      }

      const curr = yield* decodeRow(current[0]).pipe(mapDbError(InjectionLogDatabaseError, 'query'))
      const newDatetime = data.datetime !== undefined ? DateTime.formatIso(data.datetime) : curr.datetime
      const newDrug = data.drug ?? curr.drug
      const newSupplier = data.supplier !== undefined ? data.supplier : curr.supplier
      const newDoseMg = data.doseMg ?? curr.dose_mg
      const newInjectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : curr.injection_site
      const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes
      const newScheduleId = Option.isSome(data.scheduleId) ? data.scheduleId.value : curr.schedule_id
      const now = DateTime.formatIso(yield* DateTime.now)

      yield* sql`
          UPDATE injection_logs
          SET datetime = ${newDatetime},
              drug = ${newDrug},
              supplier = ${newSupplier},
              dose_mg = ${newDoseMg},
              injection_site = ${newInjectionSite},
              notes = ${newNotes},
              schedule_id = ${newScheduleId},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(InjectionLogDatabaseError, 'update'))

      // Fetch updated row
      const rows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(InjectionLogDatabaseError, 'query'))

      return yield* decodeAndTransform(rows[0]).pipe(mapDbError(InjectionLogDatabaseError, 'update'))
    })

    const del = Effect.fn('InjectionLogRepo.delete')(
      function* (id: string, userId: string) {
        // Check if exists and belongs to user
        const existing = yield* sql`SELECT id FROM injection_logs WHERE id = ${id} AND user_id = ${userId}`
        if (Arr.isReadonlyArrayEmpty(existing)) {
          return false
        }

        yield* sql`DELETE FROM injection_logs WHERE id = ${id} AND user_id = ${userId}`
        return true
      },
      mapDbError(InjectionLogDatabaseError, 'delete')
    )

    const getUniqueSites = Effect.fn('InjectionLogRepo.getUniqueSites')(
      function* (userId: string) {
        const rawRows = yield* sql`
          SELECT DISTINCT injection_site
          FROM injection_logs
          WHERE user_id = ${userId} AND injection_site IS NOT NULL
          ORDER BY injection_site
        `
        const rows = yield* decodeSiteRows(rawRows)
        return rows.map((r) => r.injection_site)
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    const getLastSite = Effect.fn('InjectionLogRepo.getLastSite')(
      function* (userId: string) {
        const rawRows = yield* sql`
          SELECT injection_site
          FROM injection_logs
          WHERE user_id = ${userId}
          ORDER BY datetime DESC
          LIMIT 1
        `
        const rows = yield* decodeLastSiteRows(rawRows)
        const [row] = rows
        return row !== undefined ? Option.fromNullOr(row.injection_site) : Option.none()
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    const listBySchedule = Effect.fn('InjectionLogRepo.listBySchedule')(
      function* (scheduleId: string, userId: string) {
        const rows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs
          WHERE schedule_id = ${scheduleId} AND user_id = ${userId}
          ORDER BY datetime ASC
        `
        const results = yield* Effect.all(rows.map(decodeAndTransform), { concurrency: 1 })
        return results
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    return {
      list,
      findById,
      create,
      update,
      delete: del,
      getUniqueSites,
      getLastSite,
      listBySchedule,
    }
  })
)
