import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { GoalId, Notes, Weight } from '#shared'

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
              startingDate: Option.some(DateTime.makeUnsafe('2024-01-01')),
              targetDate: Option.some(DateTime.makeUnsafe('2024-06-01')),
              notes: Option.some(Notes.make('Initial goal')),
            },
            180,
            'user-123'
          )

          assert.strictEqual(created.goalWeight, 150)
          assert.strictEqual(created.startingWeight, 180)
          assert.strictEqual(created.isActive, true)
          assert.strictEqual(created.notes, 'Initial goal')
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
      it.effect('handles null values correctly', () =>
        Effect.gen(function* () {
          const repo = yield* GoalRepo
          const created = yield* repo.create(
            {
              goalWeight: Weight.make(150),
              startingDate: Option.none(),
              targetDate: Option.some(DateTime.makeUnsafe('2024-06-01')),
              notes: Option.some(Notes.make('Initial notes')),
            },
            180,
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
