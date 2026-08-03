import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import { CalendarDate, GoalId, Notes, Weight } from '#shared'

import { GoalRepo, GoalRepoLive } from '../src/goals/goal-repo.js'
import { makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(GoalRepoLive)

describe('GoalRepo', () => {
  describe('create', () => {
    it.layer(TestLayer)((it) => {
      it.effect('creates a goal', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo
          const created = yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.some(CalendarDate.make('2024-01-01')),
              targetDate: Option.some(CalendarDate.make('2024-06-01')),
              notes: Option.some(Notes.make('Initial goal')),
            },
            180,
            CalendarDate.make('2024-01-01'),
            'user-123'
          )

          assert.strictEqual(created.goalWeight, 150)
          assert.strictEqual(created.startingWeight, 180)
          assert.strictEqual(created.isActive, true)
          assert.strictEqual(created.notes, 'Initial goal')

          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql`SELECT calendar_date_migrated FROM user_goals WHERE id = ${created.id}`
          const markers = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Number }))
          )(rows)
          assert.strictEqual(markers[0]?.calendar_date_migrated, 1)
        })
      )
    })
  })

  describe('update', () => {
    it.layer(TestLayer)((it) => {
      it.effect('updates a goal with apostrophe in notes (SQL injection safe)', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo
          const created = yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.none(),
              notes: Option.none(),
            },
            180,
            CalendarDate.make('2024-01-01'),
            'user-123'
          )

          // This would have caused SQL injection with the old dynamic SQL string approach
          const updated = yield* repo.update(
            {
              id: GoalId.make(created.id),
              notes: Notes.make("User's notes with 'apostrophes' and \"quotes\""),
            },
            'user-123'
          )

          assert.strictEqual(updated.notes, "User's notes with 'apostrophes' and \"quotes\"")
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('updates goal weight', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo
          const created = yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.none(),
              notes: Option.none(),
            },
            180,
            CalendarDate.make('2024-01-01'),
            'user-123'
          )

          const updated = yield* repo.update(
            {
              id: GoalId.make(created.id),
              goalWeight: Weight.make(145),
            },
            'user-123'
          )

          assert.strictEqual(updated.goalWeight, 145)
          assert.strictEqual(updated.startingWeight, 180)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('does not let notes and weight patches undo a concurrently completed date migration', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T00:00:00.000Z'
          yield* sql`
            INSERT INTO user_goals (
              id, user_id, goal_weight, starting_weight, starting_date, target_date,
              calendar_date_migrated, notes, is_active, created_at, updated_at
            ) VALUES ('goal-concurrent-migration', 'user-123', 150, 180, '2026-01-01', '2026-06-01',
                      0, 'before', 1, ${audit}, ${audit})
          `
          // Deterministically model migration committing after the repository
          // read but before its UPDATE writes the user patch.
          yield* sql`
            CREATE TRIGGER complete_goal_migration_before_patch
            BEFORE UPDATE OF goal_weight, notes ON user_goals
            WHEN OLD.id = 'goal-concurrent-migration'
            BEGIN
              UPDATE user_goals
              SET starting_date = '2026-01-02',
                  target_date = '2026-06-02',
                  calendar_date_migrated = 1
              WHERE id = OLD.id;
            END
          `

          const repo = yield* GoalRepo
          const updated = yield* repo.update(
            {
              id: GoalId.make('goal-concurrent-migration'),
              goalWeight: Weight.make(145),
              notes: Notes.make('after'),
            },
            'user-123'
          )
          const rows = yield* sql`
            SELECT goal_weight, notes, starting_date, target_date, calendar_date_migrated
            FROM user_goals WHERE id = 'goal-concurrent-migration'
          `
          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(
              Schema.Struct({
                calendar_date_migrated: Schema.Number,
                goal_weight: Schema.Number,
                notes: Schema.String,
                starting_date: Schema.String,
                target_date: Schema.String,
              })
            )
          )(rows)

          assert.strictEqual(updated.goalWeight, 145)
          assert.deepStrictEqual(state, [
            {
              calendar_date_migrated: 1,
              goal_weight: 145,
              notes: 'after',
              starting_date: '2026-01-02',
              target_date: '2026-06-02',
            },
          ])
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('handles null values correctly', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo
          const created = yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.some(CalendarDate.make('2024-06-01')),
              notes: Option.some(Notes.make('Initial notes')),
            },
            180,
            CalendarDate.make('2024-01-01'),
            'user-123'
          )

          // Set notes and targetDate to null
          const updated = yield* repo.update(
            {
              id: GoalId.make(created.id),
              notes: null,
              targetDate: null,
            },
            'user-123'
          )

          assert.isNull(updated.notes)
          assert.isNull(updated.targetDate)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('deactivates other goals when activating', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo

          // Create first goal (active)
          yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.none(),
              notes: Option.none(),
            },
            180,
            CalendarDate.make('2024-01-01'),
            'user-123'
          )

          // Create second goal (becomes active, first deactivated)
          const second = yield* repo.create(
            {
              goalWeight: Weight.make(145),
              startingDate: Option.none(),
              targetDate: Option.none(),
              notes: Option.none(),
            },
            175,
            CalendarDate.make('2024-02-01'),
            'user-123'
          )

          // Verify second is active
          assert.strictEqual(second.isActive, true)

          // Deactivate second
          yield* repo.update(
            {
              id: GoalId.make(second.id),
              isActive: false,
            },
            'user-123'
          )

          // Reactivate second
          const reactivated = yield* repo.update(
            {
              id: GoalId.make(second.id),
              isActive: true,
            },
            'user-123'
          )

          assert.strictEqual(reactivated.isActive, true)

          // First should still be inactive
          const first = yield* repo.list('user-123')
          const firstGoal = first.find((g) => g.id !== second.id)
          assert.strictEqual(firstGoal?.isActive, false)
        })
      )
    })
  })
})
