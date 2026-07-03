import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import type { GoalProgress } from '#shared'
import { buildGoalProgress, GoalDatabaseError } from '#shared'

import { GoalRepo } from './goal-repo.js'

// ============================================
// Database Row Schemas for Weight Data
// ============================================

const WeightRow = Schema.Struct({
  datetime: Schema.String,
  weight: Schema.Number,
})

const decodeWeightRow = Schema.decodeUnknownEffect(WeightRow)

// ============================================
// Goal Service Definition
// ============================================

export class GoalService extends Context.Service<
  GoalService,
  {
    /** Get most recent weight (used as starting weight if not provided) */
    readonly getMostRecentWeight: (userId: string) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Get weight at or closest to a specific date */
    readonly getWeightAtDate: (
      userId: string,
      date: DateTime.Utc
    ) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Calculate goal progress including projection */
    readonly getGoalProgress: (userId: string) => Effect.Effect<Option.Option<GoalProgress>, GoalDatabaseError>
  }
>()('@garage/subq/goals/goal-service/GoalService') {}

// ============================================
// Goal Service Implementation
// ============================================

export const GoalServiceLive = Layer.effect(
  GoalService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const goalRepo = yield* GoalRepo

    const getCurrentWeight = Effect.fn('GoalService.getCurrentWeight')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime DESC
          LIMIT 1
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeWeightRow(rows[0])
        return Option.some(decoded.weight)
      },
      Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause }))
    )

    const getMostRecentWeight = getCurrentWeight

    const getWeightHistory = Effect.fn('GoalService.getWeightHistory')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY datetime ASC
        `

        return yield* Effect.forEach(
          rows,
          (row) =>
            decodeWeightRow(row).pipe(
              Effect.map((decoded) => ({
                date: DateTime.toDate(DateTime.makeUnsafe(decoded.datetime)),
                weight: decoded.weight,
              }))
            ),
          { concurrency: 1 }
        )
      },
      Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause }))
    )

    const getWeightAtDate = Effect.fn('GoalService.getWeightAtDate')(
      function* (userId: string, date: DateTime.Utc) {
        const dateStr = DateTime.formatIso(date).slice(0, 10)
        // Get weight entry closest to the target date (on or before preferred, else after)
        const rows = yield* sql`
          SELECT datetime, weight FROM weight_logs
          WHERE user_id = ${userId}
          ORDER BY ABS(julianday(date(datetime)) - julianday(${dateStr}))
          LIMIT 1
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeWeightRow(rows[0])
        return Option.some(decoded.weight)
      },
      Effect.mapError((cause) => GoalDatabaseError.make({ operation: 'query', cause }))
    )

    const getGoalProgress = Effect.fn('GoalService.getGoalProgress')(function* (userId: string) {
      const goalOpt = yield* goalRepo.getActive(userId)
      if (Option.isNone(goalOpt)) {
        return Option.none()
      }
      const goal = goalOpt.value

      const currentWeightOpt = yield* getCurrentWeight(userId)
      if (Option.isNone(currentWeightOpt)) {
        return Option.none()
      }
      const currentWeight = currentWeightOpt.value

      const now = yield* DateTime.now
      const weightHistory = yield* getWeightHistory(userId)
      return Option.some(
        buildGoalProgress({
          goal,
          currentWeight,
          weightHistory,
          now: DateTime.toDate(now),
        })
      )
    })

    return {
      getMostRecentWeight,
      getWeightAtDate,
      getGoalProgress,
    }
  })
)
