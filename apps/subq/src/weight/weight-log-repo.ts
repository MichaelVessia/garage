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
  calendarDaysBetween,
  Notes,
  projectInstantToCalendarDate,
  Weight,
  WeightLog,
  WeightLogDatabaseError,
  WeightLogId,
  WeightLogNotFoundError,
} from '#shared'
import type { CalendarDate, IanaTimezone, WeightLogCreate, WeightLogListParams, WeightLogUpdate } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from SQLite
// (snake_case columns, ISO strings for dates, numbers for weight)
// All weights are stored in lbs
export const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  weight: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})
export type WeightLogRow = typeof WeightLogRow.Type

const decodeRow = Schema.decodeUnknownEffect(WeightLogRow)

// Transform DB row to domain object using branded type constructors
export const rowToDomain = (row: typeof WeightLogRow.Type): WeightLog =>
  new WeightLog({
    id: WeightLogId.make(row.id),
    datetime: DateTime.makeUnsafe(row.datetime),
    weight: Weight.make(row.weight),
    notes: row.notes !== null && Str.isNonEmpty(row.notes) ? Notes.make(row.notes) : null,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

// Decode and transform raw DB row
const decodeAndTransform = (raw: unknown) => Effect.map(decodeRow(raw), rowToDomain)

// ============================================
// Repository Service Definition
// ============================================

export class WeightLogRepo extends Context.Service<
  WeightLogRepo,
  {
    readonly list: (params: WeightLogListParams, userId: string) => Effect.Effect<WeightLog[], WeightLogDatabaseError>
    readonly findById: (id: string, userId: string) => Effect.Effect<Option.Option<WeightLog>, WeightLogDatabaseError>
    /** Complete weight history for a user in ascending datetime order. */
    readonly listChronological: (userId: string) => Effect.Effect<WeightLog[], WeightLogDatabaseError>
    /** Most recently logged weight entry for a user. */
    readonly mostRecent: (userId: string) => Effect.Effect<Option.Option<WeightLog>, WeightLogDatabaseError>
    /** Weight entry whose projected local date is nearest to the planned date. */
    readonly nearestToDate: (
      userId: string,
      date: CalendarDate,
      timezone: IanaTimezone
    ) => Effect.Effect<Option.Option<WeightLog>, WeightLogDatabaseError>
    readonly create: (data: WeightLogCreate, userId: string) => Effect.Effect<WeightLog, WeightLogDatabaseError>
    readonly update: (
      data: WeightLogUpdate,
      userId: string
    ) => Effect.Effect<WeightLog, WeightLogNotFoundError | WeightLogDatabaseError>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, WeightLogDatabaseError>
  }
>()('@garage/subq/weight/weight-log-repo/WeightLogRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const WeightLogRepoLive = Layer.effect(
  WeightLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = Effect.fn('WeightLogRepo.list')(
      function* (params: WeightLogListParams, userId: string) {
        // Convert DateTime params to ISO strings for SQLite comparison
        const startDateStr = params.startDate !== undefined ? DateTime.formatIso(params.startDate) : undefined
        const endDateStr = params.endDate !== undefined ? DateTime.formatIso(params.endDate) : undefined

        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE user_id = ${userId}
          ${startDateStr !== undefined ? sql`AND datetime >= ${startDateStr}` : sql``}
          ${endDateStr !== undefined ? sql`AND datetime <= ${endDateStr}` : sql``}
          ORDER BY datetime DESC
          LIMIT ${params.limit}
          OFFSET ${params.offset}
        `
        return yield* Effect.all(rows.map(decodeAndTransform), { concurrency: 1 })
      },
      mapDbError(WeightLogDatabaseError, 'query')
    )

    const listChronological = Effect.fn('WeightLogRepo.listChronological')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime ASC
        `
        return yield* Effect.all(rows.map(decodeAndTransform), { concurrency: 1 })
      },
      mapDbError(WeightLogDatabaseError, 'query')
    )

    const findById = Effect.fn('WeightLogRepo.findById')(
      function* (id: string, userId: string) {
        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${id} AND user_id = ${userId}
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeAndTransform(rows[0])
        return Option.some(decoded)
      },
      mapDbError(WeightLogDatabaseError, 'query')
    )

    const mostRecent = Effect.fn('WeightLogRepo.mostRecent')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime DESC
          LIMIT 1
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeAndTransform(rows[0])
        return Option.some(decoded)
      },
      mapDbError(WeightLogDatabaseError, 'query')
    )

    const nearestToDate = Effect.fn('WeightLogRepo.nearestToDate')(
      function* (userId: string, date: CalendarDate, timezone: IanaTimezone) {
        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime ASC
        `
        const entries = yield* Effect.all(rows.map(decodeAndTransform), { concurrency: 1 })
        return Arr.reduce(
          entries,
          Option.none<{ readonly distance: number; readonly entry: WeightLog }>(),
          (best, entry) => {
            const entryDate = projectInstantToCalendarDate(entry.datetime, timezone)
            const candidate = { distance: Math.abs(calendarDaysBetween(date, entryDate)), entry }
            return Option.match(best, {
              onNone: () => Option.some(candidate),
              onSome: (previous) => Option.some(candidate.distance < previous.distance ? candidate : previous),
            })
          }
        ).pipe(Option.map(({ entry }) => entry))
      },
      mapDbError(WeightLogDatabaseError, 'query')
    )

    const create = Effect.fn('WeightLogRepo.create')(
      function* (data: WeightLogCreate, userId: string) {
        const id = yield* randomUuid()
        const notes = Option.isSome(data.notes) ? data.notes.value : null
        const now = DateTime.formatIso(yield* DateTime.now)
        const datetimeStr = DateTime.formatIso(data.datetime)

        yield* sql`
          INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
          VALUES (${id}, ${datetimeStr}, ${data.weight}, ${notes}, ${userId}, ${now}, ${now})
        `

        // Fetch the inserted row
        const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${id}
        `
        return yield* decodeAndTransform(rows[0])
      },
      mapDbError(WeightLogDatabaseError, 'insert')
    )

    const update = Effect.fn('WeightLogRepo.update')(function* (data: WeightLogUpdate, userId: string) {
      // First get current values - include user_id check to prevent IDOR
      const current = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(WeightLogDatabaseError, 'query'))

      if (Arr.isReadonlyArrayEmpty(current)) {
        return yield* Effect.fail(WeightLogNotFoundError.make({ id: data.id }))
      }

      const curr = yield* decodeRow(current[0]).pipe(mapDbError(WeightLogDatabaseError, 'query'))
      const newDatetime = data.datetime !== undefined ? DateTime.formatIso(data.datetime) : curr.datetime
      const newWeight = data.weight ?? curr.weight
      const newNotes = Option.isSome(data.notes) ? data.notes.value : curr.notes
      const now = DateTime.formatIso(yield* DateTime.now)

      yield* sql`
          UPDATE weight_logs
          SET datetime = ${newDatetime},
              weight = ${newWeight},
              notes = ${newNotes},
              updated_at = ${now}
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(WeightLogDatabaseError, 'update'))

      // Fetch updated row
      const rows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs
          WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(WeightLogDatabaseError, 'query'))

      return yield* decodeAndTransform(rows[0]).pipe(mapDbError(WeightLogDatabaseError, 'update'))
    })

    const del = Effect.fn('WeightLogRepo.delete')(
      function* (id: string, userId: string) {
        // Check if exists and belongs to user
        const existing = yield* sql`SELECT id FROM weight_logs WHERE id = ${id} AND user_id = ${userId}`
        if (Arr.isReadonlyArrayEmpty(existing)) {
          return false
        }

        yield* sql`DELETE FROM weight_logs WHERE id = ${id} AND user_id = ${userId}`
        return true
      },
      mapDbError(WeightLogDatabaseError, 'delete')
    )

    return {
      list,
      listChronological,
      findById,
      mostRecent,
      nearestToDate,
      create,
      update,
      delete: del,
    }
  })
)
