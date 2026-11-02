import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'

import {
  CalendarDate,
  GoalId,
  IanaTimezone,
  Notes,
  SettingsTimezoneNotInitialized,
  UserGoalCreate,
  UserGoalUpdate,
  Weight,
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
  calendar_date_migrated: Schema.Int,
  starting_date: CalendarDate,
  target_date: Schema.NullOr(CalendarDate),
})

const timezone = IanaTimezone.make('America/New_York')

const insertTimezone = (userId: string) =>
  insertSettings({ id: `settings-${userId}`, userId, weightUnit: 'lbs', timezone })

describe('GoalService', () => {
  describe('updateGoal', () => {
    it.effect('recomputes the starting weight from the weight log at the new startingDate', () =>
      Effect.gen(function* () {
        const userId = 'user-update-recompute'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(200),
            startingDate: Option.some(CalendarDate.make('2024-01-01')),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        yield* insertWeightLog({ id: 'w-new', datetime: testDate('2024-03-01T00:00:00Z'), weight: 175, userId })

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            id: GoalId.make(created.id),
            startingDate: CalendarDate.make('2024-03-01'),
          })
        )

        assert.strictEqual(updated.startingWeight, 175)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('preserves starting weight and progress when the edit form resends the unchanged startingDate', () =>
      Effect.gen(function* () {
        const userId = 'user-update-ui-payload'
        yield* insertTimezone(userId)
        const service = yield* GoalService
        const startingDate = CalendarDate.make('2024-01-01')

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(210),
            startingDate: Option.some(startingDate),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        yield* insertWeightLog({ id: 'w-ui-start', datetime: testDate('2024-01-01T12:00:00Z'), weight: 200, userId })
        yield* insertWeightLog({ id: 'w-ui-current', datetime: testDate('2024-03-01T12:00:00Z'), weight: 180, userId })

        const before = yield* service.getGoalProgress(userId)
        assert.isNotNull(before.goal)

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            goalWeight: Weight.make(150),
            id: GoalId.make(created.id),
            notes: Notes.make('notes-only edit'),
            startingDate,
            targetDate: null,
          })
        )

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

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(200),
            startingDate: Option.some(CalendarDate.make('2024-01-01')),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        yield* insertWeightLog({ id: 'w-new', datetime: testDate('2024-03-01T00:00:00Z'), weight: 175, userId })

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            id: GoalId.make(created.id),
            startingDate: CalendarDate.make('2024-03-01'),
            startingWeight: Weight.make(198),
          })
        )

        assert.strictEqual(updated.startingWeight, 198)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('leaves the starting weight unchanged when startingDate is not part of the update', () =>
      Effect.gen(function* () {
        const userId = 'user-update-no-change'
        yield* insertTimezone(userId)
        const service = yield* GoalService

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(200),
            startingDate: Option.some(CalendarDate.make('2024-01-01')),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            id: GoalId.make(created.id),
            notes: Notes.make('just a note update'),
          })
        )

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
          .updateGoal(
            userId,
            UserGoalUpdate.make({
              id: GoalId.make('goal-legacy-uninitialized'),
              targetDate: CalendarDate.make('2024-06-01'),
            })
          )
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

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            id: GoalId.make('goal-legacy-migrated'),
            targetDate: CalendarDate.make('2024-06-01'),
          })
        )

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

        const created = yield* service.createGoal(
          userId,
          UserGoalCreate.make({
            goalWeight: Weight.make(150),
            startingWeight: Weight.make(200),
            startingDate: Option.some(CalendarDate.make('2024-01-01')),
            targetDate: Option.none(),
            notes: Option.none(),
          })
        )

        const updated = yield* service.updateGoal(
          userId,
          UserGoalUpdate.make({
            id: GoalId.make(created.id),
            startingDate: CalendarDate.make('2024-03-01'),
          })
        )

        assert.strictEqual(updated.startingWeight, 200)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
