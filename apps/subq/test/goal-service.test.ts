import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import {
  CalendarDate,
  GoalId,
  IanaTimezone,
  Notes,
  SettingsTimezoneNotInitialized,
  Weight,
  projectInstantToCalendarDate,
} from '#shared'

import { GoalRepoLive } from '../src/goals/goal-repo.js'
import { GoalService, GoalServiceLive } from '../src/goals/goal-service.js'
import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
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

const GoalMigrationRow = Schema.Struct({
  calendar_date_migrated: Schema.Number,
  starting_date: CalendarDate,
  target_date: Schema.NullOr(CalendarDate),
})

const timezone = IanaTimezone.make('America/New_York')
const insertTimezone = (userId: string) => insertSettings(`settings-${userId}`, userId, 'lbs', timezone)

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
      yield* insertWeightLog('w3', testDate('2024-01-15T00:00:00Z'), 190, userId)
      yield* insertWeightLog('w-other', testDate('2024-01-20T00:00:00Z'), 500, 'other-user')
      yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w2', testDate('2024-01-08T00:00:00Z'), 195, userId)

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
      yield* insertWeightLog('w-fresh-1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w-fresh-2', testDate('2024-01-08T00:00:00Z'), 190, userId)

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
        yield* insertTimezone(userId)
        yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
        yield* insertWeightLog('w2', testDate('2024-02-01T00:00:00Z'), 190, userId)

        const service = yield* GoalService
        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingDate: Option.some(CalendarDate.make('2024-02-01')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        assert.strictEqual(created.startingWeight, 190)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('falls back to the most recent weight log when neither startingWeight nor startingDate is provided', () =>
      Effect.gen(function* () {
        const userId = 'user-create-most-recent'
        yield* insertTimezone(userId)
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
        yield* insertTimezone(userId)
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
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(CalendarDate.make('2024-01-01')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        yield* insertWeightLog('w-new', testDate('2024-03-01T00:00:00Z'), 175, userId)

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: CalendarDate.make('2024-03-01'),
        })

        assert.strictEqual(updated.startingWeight, 175)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('preserves starting weight and progress when the edit form resends the unchanged startingDate', () =>
      Effect.gen(function* () {
        const userId = 'user-update-ui-payload'
        yield* insertTimezone(userId)
        const service = yield* GoalService
        const startingDate = CalendarDate.make('2024-01-01')

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(210),
          startingDate: Option.some(startingDate),
          targetDate: Option.none(),
          notes: Option.none(),
        })
        yield* insertWeightLog('w-ui-start', testDate('2024-01-01T12:00:00Z'), 200, userId)
        yield* insertWeightLog('w-ui-current', testDate('2024-03-01T12:00:00Z'), 180, userId)

        const before = yield* service.getGoalProgress(userId)
        assert.isNotNull(before.goal)

        const updated = yield* service.updateGoal(userId, {
          goalWeight: Weight.make(150),
          id: GoalId.make(created.id),
          notes: Notes.make('notes-only edit'),
          startingDate,
          targetDate: null,
        })
        const after = yield* service.getGoalProgress(userId)

        assert.strictEqual(updated.startingWeight, 210)
        assert.isNotNull(after.goal)
        if (before.goal !== null && after.goal !== null) {
          assert.strictEqual(after.goal.percentComplete, before.goal.percentComplete)
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('keeps the provided startingWeight when startingDate changes alongside it', () =>
      Effect.gen(function* () {
        const userId = 'user-update-explicit-weight'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(CalendarDate.make('2024-01-01')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        yield* insertWeightLog('w-new', testDate('2024-03-01T00:00:00Z'), 175, userId)

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: CalendarDate.make('2024-03-01'),
          startingWeight: Weight.make(198),
        })

        assert.strictEqual(updated.startingWeight, 198)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('leaves the starting weight unchanged when startingDate is not part of the update', () =>
      Effect.gen(function* () {
        const userId = 'user-update-no-change'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(CalendarDate.make('2024-01-01')),
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

    it.effect('returns a represented timezone failure before a direct date update can touch legacy provenance', () =>
      Effect.gen(function* () {
        const userId = 'user-update-uninitialized'
        yield* insertGoal({
          id: 'goal-legacy-uninitialized',
          userId,
          goalWeight: 150,
          startingWeight: 200,
          startingDate: CalendarDate.make('2024-01-01'),
          targetDate: null,
        })

        const service = yield* GoalService
        const result = yield* service
          .updateGoal(userId, {
            id: GoalId.make('goal-legacy-uninitialized'),
            targetDate: CalendarDate.make('2024-06-01'),
          })
          .pipe(Effect.result)

        assert.strictEqual(result._tag, 'Failure')
        if (result._tag === 'Failure') {
          assert.instanceOf(result.failure, SettingsTimezoneNotInitialized)
          assert.strictEqual(result.failure.userId, userId)
        }

        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql`
          SELECT starting_date, target_date, calendar_date_migrated
          FROM user_goals WHERE id = 'goal-legacy-uninitialized'
        `
        const persisted = yield* Schema.decodeUnknownEffect(Schema.Array(GoalMigrationRow))(rows)
        assert.deepStrictEqual(persisted, [
          {
            calendar_date_migrated: 0,
            starting_date: CalendarDate.make('2024-01-01'),
            target_date: null,
          },
        ])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('updates migrated dates only after initialization and keeps modern provenance', () =>
      Effect.gen(function* () {
        const userId = 'user-update-after-migration'
        yield* insertGoal({
          id: 'goal-legacy-migrated',
          userId,
          goalWeight: 150,
          startingWeight: 200,
          startingDate: CalendarDate.make('2024-01-01'),
          targetDate: null,
        })

        const settings = yield* SettingsRepo
        yield* settings.initializeTimezone(userId, IanaTimezone.make('Pacific/Auckland'))

        const service = yield* GoalService
        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make('goal-legacy-migrated'),
          targetDate: CalendarDate.make('2024-06-01'),
        })
        assert.strictEqual(updated.startingDate, '2024-01-02')
        assert.strictEqual(updated.targetDate, '2024-06-01')

        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql`
          SELECT starting_date, target_date, calendar_date_migrated
          FROM user_goals WHERE id = 'goal-legacy-migrated'
        `
        const persisted = yield* Schema.decodeUnknownEffect(Schema.Array(GoalMigrationRow))(rows)
        assert.deepStrictEqual(persisted, [
          {
            calendar_date_migrated: 1,
            starting_date: CalendarDate.make('2024-01-02'),
            target_date: CalendarDate.make('2024-06-01'),
          },
        ])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('leaves the starting weight unchanged when startingDate changes but no weight logs exist', () =>
      Effect.gen(function* () {
        const userId = 'user-update-no-weight-logs'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(userId, {
          goalWeight: Weight.make(150),
          startingWeight: Weight.make(200),
          startingDate: Option.some(CalendarDate.make('2024-01-01')),
          targetDate: Option.none(),
          notes: Option.none(),
        })

        const updated = yield* service.updateGoal(userId, {
          id: GoalId.make(created.id),
          startingDate: CalendarDate.make('2024-03-01'),
        })

        assert.strictEqual(updated.startingWeight, 200)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
