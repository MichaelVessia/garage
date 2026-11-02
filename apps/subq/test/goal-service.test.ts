import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as SqlClient from 'effect/sql/SqlClient'

import { CalendarDate, IanaTimezone, projectInstantToCalendarDate, UserGoalCreate, Weight } from '#shared'

import { GoalRepoLive } from '../src/goals/goal-repo.js'
import { GoalService, GoalServiceLive } from '../src/goals/goal-service.js'
import { SettingsRepoLive } from '../src/settings/settings-repo.js'
import { WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertSettings, insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const GoalServiceTestLive = GoalServiceLive.pipe(
  Layer.provide(GoalRepoLive),
  Layer.provide(WeightLogRepoLive),
  Layer.provide(SettingsRepoLive)
)

const TestLayer = makeInitializedTestLayer(Layer.merge(GoalServiceTestLive, SettingsRepoLive))
const MS_PER_DAY = 24 * 60 * 60 * 1000

const insertGoal = (params: {
  readonly id: string
  readonly userId: string
  readonly goalWeight: number
  readonly startingWeight: number
  readonly startingDate: CalendarDate
  readonly targetDate: CalendarDate | null
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(DateTime.makeUnsafe('2024-01-01T00:00:00Z'))
    yield* sql`
      INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
      VALUES (${params.id}, ${params.userId}, ${params.goalWeight}, ${params.startingWeight}, ${params.startingDate}, ${params.targetDate}, null, 1, null, ${now}, ${now})
    `
  })

const timezone = IanaTimezone.make('America/New_York')

const insertTimezone = (userId: string) =>
  insertSettings({ id: `settings-${userId}`, userId, weightUnit: 'lbs', timezone })

describe('GoalService', () => {
  it.effect('uses Weight Trajectory for Goal Progress rate, projection, and pace', () =>
    Effect.gen(function* () {
      const userId = 'user-trajectory'
      yield* insertTimezone(userId)

      const now = yield* DateTime.now
      const nowMillis = DateTime.toEpochMillis(now)

      yield* insertGoal({
        id: 'goal-1',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: CalendarDate.make('2024-01-01'),
        targetDate: projectInstantToCalendarDate(DateTime.makeUnsafe(nowMillis + 365 * MS_PER_DAY), timezone),
      })
      yield* insertWeightLog({ id: 'w3', datetime: testDate('2024-01-15T00:00:00Z'), weight: 190, userId })
      yield* insertWeightLog({
        id: 'w-other',
        datetime: testDate('2024-01-20T00:00:00Z'),
        weight: 500,
        userId: 'other-user',
      })
      yield* insertWeightLog({ id: 'w1', datetime: testDate('2024-01-01T00:00:00Z'), weight: 200, userId })
      yield* insertWeightLog({ id: 'w2', datetime: testDate('2024-01-08T00:00:00Z'), weight: 195, userId })

      const service = yield* GoalService
      const earliestProjection = nowMillis + 14 * MS_PER_DAY - 1000
      const result = yield* service.getGoalProgress(userId)
      assert.strictEqual(result.timezone, timezone)
      assert.isNotNull(result.goal)

      if (result.goal === null) {
        return
      }

      const progress = result.goal

      assert.closeTo(progress.avgLbsPerWeek, 5, 0.005)
      assert.strictEqual(progress.paceStatus, 'ahead')
      assert.isNotNull(progress.projectedDate)

      if (progress.projectedDate === null) {
        return
      }

      assert.strictEqual(
        progress.projectedDate,
        projectInstantToCalendarDate(DateTime.makeUnsafe(earliestProjection + 1000), timezone)
      )
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('reads fresh User Goal changes when calculating Goal Progress', () =>
    Effect.gen(function* () {
      const userId = 'user-fresh-goal-progress'
      yield* insertTimezone(userId)

      yield* insertGoal({
        id: 'goal-freshness',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: CalendarDate.make('2024-01-01'),
        targetDate: null,
      })
      yield* insertWeightLog({ id: 'w-fresh-1', datetime: testDate('2024-01-01T00:00:00Z'), weight: 200, userId })
      yield* insertWeightLog({ id: 'w-fresh-2', datetime: testDate('2024-01-08T00:00:00Z'), weight: 190, userId })

      const service = yield* GoalService
      const beforeResult = yield* service.getGoalProgress(userId)

      assert.isNotNull(beforeResult.goal)

      if (beforeResult.goal === null) {
        return
      }

      const before = beforeResult.goal
      assert.strictEqual(before.lbsRemaining, 10)
      assert.strictEqual(before.percentComplete, 50)

      const sql = yield* SqlClient.SqlClient
      yield* sql`
        UPDATE user_goals
        SET goal_weight = 170
        WHERE id = 'goal-freshness' AND user_id = ${userId}
      `

      const afterResult = yield* service.getGoalProgress(userId)

      assert.isNotNull(afterResult.goal)

      if (afterResult.goal === null) {
        return
      }

      const after = afterResult.goal
      assert.strictEqual(after.lbsRemaining, 20)
      assert.closeTo(after.percentComplete, 33.333, 0.0005)
    }).pipe(Effect.provide(TestLayer))
  )

  describe('createGoal', () => {
    it.effect('uses the explicit startingWeight when provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-explicit'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(210),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        assert.strictEqual(created.startingWeight, 210)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('falls back to the weight logged at startingDate when startingWeight is omitted', () =>
      Effect.gen(function* () {
        const userId = 'user-create-at-date'
        yield* insertTimezone(userId)
        yield* insertWeightLog({ id: 'w1', datetime: testDate('2024-01-01T00:00:00Z'), weight: 200, userId })
        yield* insertWeightLog({ id: 'w2', datetime: testDate('2024-02-01T00:00:00Z'), weight: 190, userId })

        const service = yield* GoalService

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingDate: Option.some(CalendarDate.make('2024-02-01')),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        assert.strictEqual(created.startingWeight, 190)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('falls back to the most recent weight log when neither startingWeight nor startingDate is provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-most-recent'
        yield* insertTimezone(userId)
        yield* insertWeightLog({ id: 'w1', datetime: testDate('2024-01-01T00:00:00Z'), weight: 200, userId })
        yield* insertWeightLog({ id: 'w2', datetime: testDate('2024-03-01T00:00:00Z'), weight: 185, userId })

        const service = yield* GoalService

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        assert.strictEqual(created.startingWeight, 185)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('fails with NoWeightDataError when no weight logs exist and no startingWeight is provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-no-data'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const result = yield* service
          .createGoal(
            userId,
            UserGoalCreate.make({
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.none(),
              notes: Option.none(),
            })
          )
          .pipe(Effect.result)

        assert.strictEqual(result._tag, 'Failure')

        if (result._tag === 'Failure') {
          assert.strictEqual(result.failure._tag, 'NoWeightDataError')
        }
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
