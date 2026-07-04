import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { SqlClient } from 'effect/unstable/sql'

import { GoalId, Notes, Weight } from '#shared'

import { GoalRepoLive } from '../src/goals/goal-repo.js'
import { GoalService, GoalServiceLive } from '../src/goals/goal-service.js'
import { testDate } from './helpers/dates.js'
import { insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(GoalServiceLive.pipe(Layer.provide(GoalRepoLive)))
const MS_PER_DAY = 24 * 60 * 60 * 1000

const insertGoal = (params: {
  readonly id: string
  readonly userId: string
  readonly goalWeight: number
  readonly startingWeight: number
  readonly startingDate: Date
  readonly targetDate: Date | null
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(DateTime.makeUnsafe('2024-01-01T00:00:00Z'))
    yield* sql`
      INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
      VALUES (${params.id}, ${params.userId}, ${params.goalWeight}, ${params.startingWeight}, ${params.startingDate.toISOString()}, ${params.targetDate?.toISOString() ?? null}, null, 1, null, ${now}, ${now})
    `
  })

describe('GoalService', () => {
  it.effect('uses Weight Trajectory for Goal Progress rate, projection, and pace', () =>
    Effect.gen(function* () {
      const userId = 'user-trajectory'

      const now = yield* DateTime.now
      const nowMillis = DateTime.toEpochMillis(now)

      yield* insertGoal({
        id: 'goal-1',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: testDate('2024-01-01T00:00:00Z'),
        targetDate: DateTime.toDate(DateTime.makeUnsafe(nowMillis + 365 * MS_PER_DAY)),
      })
      yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w2', testDate('2024-01-08T00:00:00Z'), 195, userId)
      yield* insertWeightLog('w3', testDate('2024-01-15T00:00:00Z'), 190, userId)

      const service = yield* GoalService
      const earliestProjection = nowMillis + 14 * MS_PER_DAY - 1000
      const progressOpt = yield* service.getGoalProgress(userId)
      const latestProjection = nowMillis + 14 * MS_PER_DAY + 1000

      assert.isTrue(Option.isSome(progressOpt))
      if (Option.isNone(progressOpt)) {
        return
      }
      const progress = progressOpt.value

      assert.closeTo(progress.avgLbsPerWeek, 5, 0.005)
      assert.strictEqual(progress.paceStatus, 'ahead')
      assert.isNotNull(progress.projectedDate)
      if (progress.projectedDate === null) {
        return
      }
      assert.isAtLeast(DateTime.toEpochMillis(progress.projectedDate), earliestProjection)
      assert.isAtMost(DateTime.toEpochMillis(progress.projectedDate), latestProjection)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('reads fresh User Goal changes when calculating Goal Progress', () =>
    Effect.gen(function* () {
      const userId = 'user-fresh-goal-progress'

      yield* insertGoal({
        id: 'goal-freshness',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: testDate('2024-01-01T00:00:00Z'),
        targetDate: null,
      })
      yield* insertWeightLog('w-fresh-1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w-fresh-2', testDate('2024-01-08T00:00:00Z'), 190, userId)

      const service = yield* GoalService
      const beforeOpt = yield* service.getGoalProgress(userId)

      assert.isTrue(Option.isSome(beforeOpt))
      if (Option.isNone(beforeOpt)) {
        return
      }
      const before = beforeOpt.value
      assert.strictEqual(before.lbsRemaining, 10)
      assert.strictEqual(before.percentComplete, 50)

      const sql = yield* SqlClient.SqlClient
      yield* sql`
        UPDATE user_goals
        SET goal_weight = 170
        WHERE id = 'goal-freshness' AND user_id = ${userId}
      `

      const afterOpt = yield* service.getGoalProgress(userId)

      assert.isTrue(Option.isSome(afterOpt))
      if (Option.isNone(afterOpt)) {
        return
      }
      const after = afterOpt.value
      assert.strictEqual(after.lbsRemaining, 20)
      assert.closeTo(after.percentComplete, 33.333, 0.0005)
    }).pipe(Effect.provide(TestLayer))
  )

  describe('createGoal', () => {
    it.effect('uses the explicit startingWeight when provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-explicit'
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(210),
          startingDate: Option.none(),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        assert.strictEqual(created.startingWeight, 210)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('falls back to the weight logged at startingDate when startingWeight is omitted', () =>
      Effect.gen(function* () {
        const userId = 'user-create-at-date'
        yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
        yield* insertWeightLog('w2', testDate('2024-02-01T00:00:00Z'), 190, userId)

        const service = yield* GoalService
        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingDate: Option.some(DateTime.makeUnsafe('2024-02-01T00:00:00Z')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        assert.strictEqual(created.startingWeight, 190)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('falls back to the most recent weight log when neither startingWeight nor startingDate is provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-most-recent'
        yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
        yield* insertWeightLog('w2', testDate('2024-03-01T00:00:00Z'), 185, userId)

        const service = yield* GoalService
        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingDate: Option.none(),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        assert.strictEqual(created.startingWeight, 185)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('fails with NoWeightDataError when no weight logs exist and no startingWeight is provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-no-data'
        const service = yield* GoalService

        const result = yield* service
          .createGoal(userId, {
            goalWeight: Weight.make(150),
            startingDate: Option.none(),
            targetDate: Option.none(),
            notes: Option.none(),
          })
          .pipe(Effect.result)

        assert.strictEqual(result._tag, 'Failure')
        if (result._tag === 'Failure') {
          assert.strictEqual(result.failure._tag, 'NoWeightDataError')
        }
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe('updateGoal', () => {
    it.effect('recomputes the starting weight from the weight log at the new startingDate', () =>
      Effect.gen(function* () {
        const userId = 'user-update-recompute'
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(DateTime.makeUnsafe('2024-01-01T00:00:00Z')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        yield* insertWeightLog('w-new', testDate('2024-03-01T00:00:00Z'), 175, userId)

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: DateTime.makeUnsafe('2024-03-01T00:00:00Z'),
        })

        assert.strictEqual(updated.startingWeight, 175)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('keeps the provided startingWeight when startingDate changes alongside it', () =>
      Effect.gen(function* () {
        const userId = 'user-update-explicit-weight'
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(DateTime.makeUnsafe('2024-01-01T00:00:00Z')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        yield* insertWeightLog('w-new', testDate('2024-03-01T00:00:00Z'), 175, userId)

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: DateTime.makeUnsafe('2024-03-01T00:00:00Z'),
          startingWeight: Weight.make(198),
        })

        assert.strictEqual(updated.startingWeight, 198)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('leaves the starting weight unchanged when startingDate is not part of the update', () =>
      Effect.gen(function* () {
        const userId = 'user-update-no-change'
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(DateTime.makeUnsafe('2024-01-01T00:00:00Z')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          notes: Notes.make('just a note update'),
        })

        assert.strictEqual(updated.startingWeight, 200)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('leaves the starting weight unchanged when startingDate changes but no weight logs exist', () =>
      Effect.gen(function* () {
        const userId = 'user-update-no-weight-logs'
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(DateTime.makeUnsafe('2024-01-01T00:00:00Z')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: DateTime.makeUnsafe('2024-03-01T00:00:00Z'),
        })

        assert.strictEqual(updated.startingWeight, 200)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
