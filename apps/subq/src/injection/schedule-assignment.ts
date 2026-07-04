import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import { InjectionLogDatabaseError, ScheduleAssignmentTargetNotFoundError } from '#shared'
import type { InjectionLogBulkAssignSchedule } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'

const CountRow = Schema.Struct({ count: Schema.Number })
const decodeCountRow = Schema.decodeUnknownEffect(CountRow)

export class ScheduleAssignment extends Context.Service<
  ScheduleAssignment,
  {
    readonly assign: (
      data: InjectionLogBulkAssignSchedule,
      userId: string
    ) => Effect.Effect<number, InjectionLogDatabaseError | ScheduleAssignmentTargetNotFoundError>
  }
>()('@garage/subq/injection/schedule-assignment/ScheduleAssignment') {}

export const ScheduleAssignmentLive = Layer.effect(
  ScheduleAssignment,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const countRowsForUser = Effect.fn('ScheduleAssignment.countRowsForUser')(
      function* (ids: readonly string[], userId: string) {
        const rows = yield* sql`
          SELECT COUNT(*) as count FROM injection_logs
          WHERE id IN ${sql.in(ids)} AND user_id = ${userId}
        `
        const [rawRow] = rows
        const row = yield* decodeCountRow(rawRow)
        return row.count
      },
      mapDbError(InjectionLogDatabaseError, 'query')
    )

    const requireScheduleOwnedByUser = Effect.fn('ScheduleAssignment.requireScheduleOwnedByUser')(function* (
      scheduleId: string,
      userId: string
    ) {
      const row = yield* sql`
        SELECT COUNT(*) as count FROM injection_schedules
        WHERE id = ${scheduleId} AND user_id = ${userId}
      `.pipe(
        Effect.flatMap((rows) => decodeCountRow(rows[0])),
        mapDbError(InjectionLogDatabaseError, 'query')
      )

      if (row.count === 0) {
        return yield* Effect.fail(ScheduleAssignmentTargetNotFoundError.make({ scheduleId }))
      }
      return yield* Effect.void
    })

    const assign = Effect.fn('ScheduleAssignment.assign')(function* (
      data: InjectionLogBulkAssignSchedule,
      userId: string
    ) {
      if (Arr.isReadonlyArrayEmpty(data.ids)) {
        return 0
      }

      if (data.scheduleId !== null) {
        yield* requireScheduleOwnedByUser(data.scheduleId, userId)
      }

      const now = DateTime.formatIso(yield* DateTime.now)
      const { scheduleId } = data

      yield* sql`
        UPDATE injection_logs
        SET schedule_id = ${scheduleId},
            updated_at = ${now}
        WHERE id IN ${sql.in(data.ids)} AND user_id = ${userId}
      `.pipe(mapDbError(InjectionLogDatabaseError, 'update'))

      return yield* countRowsForUser(data.ids, userId)
    })

    return { assign }
  })
)
