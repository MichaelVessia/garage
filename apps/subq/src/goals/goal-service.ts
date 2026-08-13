import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import type { CalendarDate, GoalNotFoundError, IanaTimezone, UserGoal, UserGoalCreate } from '#shared'
import {
  buildGoalProgress,
  GoalDatabaseError,
  GoalProgressResult,
  NoWeightDataError,
  projectInstantToCalendarDate,
  SettingsTimezoneNotInitialized,
  UserGoalUpdate,
  Weight,
} from '#shared'

import { SettingsRepo } from '../settings/settings-repo.js'
import { mapDbError } from '../shared/common/db-error.js'
import { WeightLogRepo } from '../weight/weight-log-repo.js'
import { GoalRepo } from './goal-repo.js'

interface RecomputedGoalUpdate {
  id: UserGoalUpdate['id']
  startingWeight: NonNullable<UserGoalUpdate['startingWeight']>
  startingDate: NonNullable<UserGoalUpdate['startingDate']>
  goalWeight?: UserGoalUpdate['goalWeight']
  targetDate?: UserGoalUpdate['targetDate']
  notes?: UserGoalUpdate['notes']
  isActive?: UserGoalUpdate['isActive']
}

export class GoalService extends Context.Service<
  GoalService,
  {
    /** Get most recent weight (used as starting weight if not provided). */
    readonly getMostRecentWeight: (userId: string) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Get the weight whose local calendar date is nearest to a planned date. */
    readonly getWeightAtDate: (
      userId: string,
      date: CalendarDate
    ) => Effect.Effect<Option.Option<number>, GoalDatabaseError>
    /** Calculate goal progress including projection. */
    readonly getGoalProgress: (userId: string) => Effect.Effect<GoalProgressResult, GoalDatabaseError>
    readonly createGoal: (
      userId: string,
      data: UserGoalCreate
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError | NoWeightDataError>
    readonly updateGoal: (
      userId: string,
      data: UserGoalUpdate
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError | SettingsTimezoneNotInitialized>
  }
>()('@garage/subq/goals/goal-service/GoalService') {}

export const GoalServiceLive = Layer.effect(
  GoalService,
  Effect.gen(function* () {
    const goalRepo = yield* GoalRepo
    const weightLogRepo = yield* WeightLogRepo
    const settingsRepo = yield* SettingsRepo

    const getTimezone = Effect.fn('GoalService.getTimezone')(function* (userId: string) {
      const settings = yield* settingsRepo
        .get(userId)
        .pipe(Effect.mapError((error) => GoalDatabaseError.make({ operation: error.operation, cause: error.cause })))
      return yield* Option.match(settings, {
        onNone: () =>
          Effect.fail(
            GoalDatabaseError.make({
              operation: 'query',
              cause: new SettingsTimezoneNotInitialized({ userId }),
            })
          ),
        onSome: ({ timezone }) => Effect.succeed(timezone),
      })
    })

    const requireCompletedTimezoneMigration = Effect.fn('GoalService.requireCompletedTimezoneMigration')(function* (
      userId: string
    ) {
      const settings = yield* settingsRepo
        .get(userId)
        .pipe(Effect.mapError((error) => GoalDatabaseError.make({ operation: error.operation, cause: error.cause })))
      return yield* Option.match(settings, {
        onNone: () => Effect.fail(new SettingsTimezoneNotInitialized({ userId })),
        onSome: ({ timezone }) => Effect.succeed(timezone),
      })
    })

    const getCurrentWeight = Effect.fn('GoalService.getCurrentWeight')(
      function* (userId: string) {
        const entry = yield* weightLogRepo.mostRecent(userId)
        return Option.map(entry, ({ weight }) => weight)
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const getMostRecentWeight = getCurrentWeight

    const getWeightHistory = Effect.fn('GoalService.getWeightHistory')(
      function* (userId: string) {
        const entries = yield* weightLogRepo.listChronological(userId)
        return entries.map((entry) => ({ date: DateTime.toDate(entry.datetime), weight: entry.weight }))
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const getWeightAtDateInTimezone = Effect.fn('GoalService.getWeightAtDateInTimezone')(
      function* (userId: string, date: CalendarDate, timezone: IanaTimezone) {
        const nearest = yield* weightLogRepo.nearestToDate(userId, date, timezone)
        return Option.map(nearest, ({ weight }) => weight)
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const getWeightAtDate = Effect.fn('GoalService.getWeightAtDate')(function* (userId: string, date: CalendarDate) {
      const timezone = yield* getTimezone(userId)
      return yield* getWeightAtDateInTimezone(userId, date, timezone)
    })

    const getGoalProgress = Effect.fn('GoalService.getGoalProgress')(function* (userId: string) {
      const timezone = yield* getTimezone(userId)
      const goal = yield* goalRepo.getActive(userId)
      if (Option.isNone(goal)) {
        return new GoalProgressResult({ goal: null, timezone })
      }

      const currentWeight = yield* getCurrentWeight(userId)
      if (Option.isNone(currentWeight)) {
        return new GoalProgressResult({ goal: null, timezone })
      }

      const now = yield* DateTime.now
      const weightHistory = yield* getWeightHistory(userId)
      return new GoalProgressResult({
        goal: buildGoalProgress({
          goal: goal.value,
          currentWeight: currentWeight.value,
          weightHistory,
          now: DateTime.toDate(now),
          timezone,
        }),
        timezone,
      })
    })

    const resolveStartingWeight = Effect.fn('GoalService.resolveStartingWeight')(function* (
      userId: string,
      data: UserGoalCreate,
      timezone: IanaTimezone
    ) {
      if (data.startingWeight !== undefined) {
        return data.startingWeight
      }
      const weight = Option.isSome(data.startingDate)
        ? yield* getWeightAtDateInTimezone(userId, data.startingDate.value, timezone)
        : yield* getMostRecentWeight(userId)
      if (Option.isNone(weight)) {
        return yield* Effect.fail(NoWeightDataError.make({}))
      }
      return weight.value
    })

    const createGoal = Effect.fn('GoalService.createGoal')(function* (userId: string, data: UserGoalCreate) {
      const timezone = yield* getTimezone(userId)
      const startingWeight = yield* resolveStartingWeight(userId, data, timezone)
      const now = yield* DateTime.now
      const startingDate = Option.getOrElse(data.startingDate, () => projectInstantToCalendarDate(now, timezone))
      return yield* goalRepo.create(data, startingWeight, startingDate, userId)
    })

    const recomputeStartingWeightOnDateChange = Effect.fn('GoalService.recomputeStartingWeightOnDateChange')(function* (
      userId: string,
      data: UserGoalUpdate,
      timezone: IanaTimezone
    ) {
      if (data.startingDate === undefined || data.startingWeight !== undefined) {
        return data
      }
      const current = yield* goalRepo.findById(data.id, userId)
      if (Option.isNone(current) || current.value.startingDate === data.startingDate) {
        return data
      }
      const weight = yield* getWeightAtDateInTimezone(userId, data.startingDate, timezone)
      if (Option.isNone(weight)) {
        return data
      }
      const update: RecomputedGoalUpdate = {
        id: data.id,
        startingWeight: Weight.make(weight.value),
        startingDate: data.startingDate,
      }
      if (data.goalWeight !== undefined) {
        update.goalWeight = data.goalWeight
      }
      if (data.targetDate !== undefined) {
        update.targetDate = data.targetDate
      }
      if (data.notes !== undefined) {
        update.notes = data.notes
      }
      if (data.isActive !== undefined) {
        update.isActive = data.isActive
      }
      return new UserGoalUpdate(update)
    })

    const updateGoal = Effect.fn('GoalService.updateGoal')(function* (userId: string, data: UserGoalUpdate) {
      const changesPlannedDates = data.startingDate !== undefined || data.targetDate !== undefined
      if (!changesPlannedDates) {
        return yield* goalRepo.update(data, userId)
      }
      const timezone = yield* requireCompletedTimezoneMigration(userId)
      const updateData = yield* recomputeStartingWeightOnDateChange(userId, data, timezone)
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
