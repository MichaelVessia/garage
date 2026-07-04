import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import type { GoalNotFoundError, GoalProgress, UserGoal, UserGoalCreate } from '#shared'
import { buildGoalProgress, GoalDatabaseError, NoWeightDataError, UserGoalUpdate, Weight } from '#shared'

import { WeightLogRepo } from '../weight/weight-log-repo.js'
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
    /**
     * Create a goal, resolving the starting weight: explicit value takes
     * priority, then the weight logged at startingDate, then the most
     * recent weight log. Fails with NoWeightDataError when none is found.
     */
    readonly createGoal: (
      userId: string,
      data: UserGoalCreate
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError | NoWeightDataError>
    /**
     * Update a goal, recomputing the starting weight from the weight log at
     * the new startingDate when startingDate changes without an explicit
     * startingWeight.
     */
    readonly updateGoal: (
      userId: string,
      data: UserGoalUpdate
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError>
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
    const weightLogRepo = yield* WeightLogRepo

    const getCurrentWeight = Effect.fn('GoalService.getCurrentWeight')(
      function* (userId: string) {
        const entryOpt = yield* weightLogRepo.mostRecent(userId)
        return Option.map(entryOpt, (entry) => entry.weight)
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
        const entryOpt = yield* weightLogRepo.nearestToDate(userId, date)
        return Option.map(entryOpt, (entry) => entry.weight)
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

    const resolveStartingWeight = Effect.fn('GoalService.resolveStartingWeight')(function* (
      userId: string,
      data: UserGoalCreate
    ) {
      if (data.startingWeight !== undefined) {
        return data.startingWeight
      }
      const weightOpt = Option.isSome(data.startingDate)
        ? yield* getWeightAtDate(userId, data.startingDate.value)
        : yield* getMostRecentWeight(userId)
      if (Option.isNone(weightOpt)) {
        return yield* Effect.fail(NoWeightDataError.make({}))
      }
      return weightOpt.value
    })

    const createGoal = Effect.fn('GoalService.createGoal')(function* (userId: string, data: UserGoalCreate) {
      const startingWeight = yield* resolveStartingWeight(userId, data)
      return yield* goalRepo.create(data, startingWeight, userId)
    })

    const recomputeStartingWeightOnDateChange = Effect.fn('GoalService.recomputeStartingWeightOnDateChange')(function* (
      userId: string,
      data: UserGoalUpdate
    ) {
      if (data.startingDate === undefined || data.startingWeight !== undefined) {
        return data
      }
      const weightOpt = yield* getWeightAtDate(userId, data.startingDate)
      if (Option.isNone(weightOpt)) {
        return data
      }
      return new UserGoalUpdate({
        id: data.id,
        ...(data.goalWeight === undefined ? {} : { goalWeight: data.goalWeight }),
        startingWeight: Weight.make(weightOpt.value),
        startingDate: data.startingDate,
        ...(data.targetDate === undefined ? {} : { targetDate: data.targetDate }),
        ...(data.notes === undefined ? {} : { notes: data.notes }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      })
    })

    const updateGoal = Effect.fn('GoalService.updateGoal')(function* (userId: string, data: UserGoalUpdate) {
      const updateData = yield* recomputeStartingWeightOnDateChange(userId, data)
      return yield* goalRepo.update(updateData, userId)
    })

    return {
      getMostRecentWeight,
      getWeightAtDate,
      getGoalProgress,
      createGoal,
      updateGoal,
    }
  })
)
