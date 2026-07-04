import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { Limit, Notes, Offset, Weight, WeightLogId } from '#shared'

import { WeightLogRepo, WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('WeightLogRepo', () => {
  describe('create', () => {
    it.layer(TestLayer)((it) => {
      it.effect('creates a weight log entry with all fields', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const created = yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185.5),
              notes: Option.some(Notes.make('Morning weigh-in')),
            },
            'user-123'
          )

          assert.strictEqual(created.weight, 185.5)
          assert.strictEqual(created.notes, 'Morning weigh-in')
          assert.isDefined(created.id)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('creates a weight log entry without notes', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const created = yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            },
            'user-123'
          )

          assert.strictEqual(created.weight, 180)
          assert.isNull(created.notes)
        })
      )
    })
  })

  describe('findById', () => {
    it.layer(TestLayer)((it) => {
      it.effect('finds existing entry by id', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const created = yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            },
            'user-123'
          )

          const found = yield* repo.findById(created.id, 'user-123')
          assert.isTrue(Option.isSome(found))
          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, created.id)
            assert.strictEqual(found.value.weight, 180)
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns none for non-existent id', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const found = yield* repo.findById('non-existent', 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('does not find entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-01-15T10:00:00Z'), 180, 'user-456')

          const repo = yield* WeightLogRepo
          const found = yield* repo.findById('wl-1', 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })
  })

  describe('mostRecent', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none for an empty table', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const found = yield* repo.mostRecent('user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns the entry with the latest datetime regardless of insertion order', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-2', testDate('2024-02-01T00:00:00Z'), 190, 'user-123')
          yield* insertWeightLog('wl-1', testDate('2024-01-01T00:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('wl-3', testDate('2024-03-01T00:00:00Z'), 185, 'user-123')

          const repo = yield* WeightLogRepo
          const found = yield* repo.mostRecent('user-123')
          assert.isTrue(Option.isSome(found))
          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, 'wl-3')
            assert.strictEqual(found.value.weight, 185)
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('ignores entries belonging to a different user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-03-01T00:00:00Z'), 175, 'user-456')

          const repo = yield* WeightLogRepo
          const found = yield* repo.mostRecent('user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })
  })

  describe('nearestToDate', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none for an empty table', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', DateTime.makeUnsafe('2024-01-15T00:00:00Z'))
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns the entry closest to the target date when the target is between two entries', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-before', testDate('2024-01-01T00:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('wl-after', testDate('2024-01-20T00:00:00Z'), 190, 'user-123')

          const repo = yield* WeightLogRepo
          // Closer to 2024-01-01 (4 days away) than to 2024-01-20 (15 days away)
          const found = yield* repo.nearestToDate('user-123', DateTime.makeUnsafe('2024-01-05T00:00:00Z'))
          assert.isTrue(Option.isSome(found))
          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, 'wl-before')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('prefers the entry after the target date when it is closer than the one before', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-before', testDate('2024-01-01T00:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('wl-after', testDate('2024-01-20T00:00:00Z'), 190, 'user-123')

          const repo = yield* WeightLogRepo
          // Closer to 2024-01-20 (2 days away) than to 2024-01-01 (17 days away)
          const found = yield* repo.nearestToDate('user-123', DateTime.makeUnsafe('2024-01-18T00:00:00Z'))
          assert.isTrue(Option.isSome(found))
          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, 'wl-after')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns the exact match when an entry exists on the target date', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-exact', testDate('2024-01-15T08:00:00Z'), 180, 'user-123')
          yield* insertWeightLog('wl-far', testDate('2024-06-01T00:00:00Z'), 170, 'user-123')

          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', DateTime.makeUnsafe('2024-01-15T00:00:00Z'))
          assert.isTrue(Option.isSome(found))
          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, 'wl-exact')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('ignores entries belonging to a different user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-01-15T00:00:00Z'), 180, 'user-456')

          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', DateTime.makeUnsafe('2024-01-15T00:00:00Z'))
          assert.isTrue(Option.isNone(found))
        })
      )
    })
  })

  describe('list', () => {
    it.layer(TestLayer)((it) => {
      it.effect('lists weight logs with pagination', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          for (let i = 0; i < 5; i += 1) {
            yield* repo.create(
              {
                datetime: DateTime.makeUnsafe(`2024-01-${15 + i}T10:00:00Z`),
                weight: Weight.make(180 + i),
                notes: Option.none(),
              },
              'user-123'
            )
          }

          const page1 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(0) }, 'user-123')
          assert.strictEqual(page1.length, 2)
          // Should be sorted by datetime DESC, so newest first
          assert.strictEqual(requireValue(page1[0]).weight, 184)
          assert.strictEqual(requireValue(page1[1]).weight, 183)

          const page2 = yield* repo.list({ limit: Limit.make(2), offset: Offset.make(2) }, 'user-123')
          assert.strictEqual(page2.length, 2)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters by date range', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-10T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            },
            'user-123'
          )
          yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(181),
              notes: Option.none(),
            },
            'user-123'
          )
          yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-20T10:00:00Z'),
              weight: Weight.make(182),
              notes: Option.none(),
            },
            'user-123'
          )

          const filtered = yield* repo.list(
            {
              limit: Limit.make(50),
              offset: Offset.make(0),
              startDate: DateTime.makeUnsafe('2024-01-12T00:00:00Z'),
              endDate: DateTime.makeUnsafe('2024-01-18T00:00:00Z'),
            },
            'user-123'
          )

          assert.strictEqual(filtered.length, 1)
          assert.strictEqual(requireValue(filtered[0]).weight, 181)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only returns entries for the specified user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-01-15T10:00:00Z'), 180, 'user-123')
          yield* insertWeightLog('wl-2', testDate('2024-01-16T10:00:00Z'), 175, 'user-456')
          yield* insertWeightLog('wl-3', testDate('2024-01-17T10:00:00Z'), 185, 'user-123')

          const repo = yield* WeightLogRepo
          const logs = yield* repo.list({ limit: Limit.make(50), offset: Offset.make(0) }, 'user-123')

          assert.strictEqual(logs.length, 2)
          assert.isTrue(logs.every((l) => l.id === 'wl-1' || l.id === 'wl-3'))
        })
      )
    })
  })

  describe('update', () => {
    it.layer(TestLayer)((it) => {
      it.effect('updates weight and notes', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const created = yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185),
              notes: Option.none(),
            },
            'user-123'
          )

          const updated = yield* repo.update(
            {
              id: created.id,
              weight: Weight.make(184),
              notes: Option.some(Notes.make('After workout')),
            },
            'user-123'
          )

          assert.strictEqual(updated.weight, 184)
          assert.strictEqual(updated.notes, 'After workout')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('fails for non-existent entry', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const result = yield* repo
            .update(
              {
                id: WeightLogId.make('non-existent'),
                weight: Weight.make(180),
                notes: Option.none(),
              },
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'WeightLogNotFoundError')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot update entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-01-15T10:00:00Z'), 180, 'user-456')

          const repo = yield* WeightLogRepo
          const result = yield* repo
            .update(
              {
                id: WeightLogId.make('wl-1'),
                weight: Weight.make(999),
                notes: Option.none(),
              },
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'WeightLogNotFoundError')
          }
        })
      )
    })
  })

  describe('delete', () => {
    it.layer(TestLayer)((it) => {
      it.effect('deletes existing entry', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const created = yield* repo.create(
            {
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185),
              notes: Option.none(),
            },
            'user-123'
          )

          const deleted = yield* repo.delete(created.id, 'user-123')
          assert.isTrue(deleted)

          const found = yield* repo.findById(created.id, 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns false for non-existent entry', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const deleted = yield* repo.delete('non-existent', 'user-123')
          assert.isFalse(deleted)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot delete entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('wl-1', testDate('2024-01-15T10:00:00Z'), 180, 'user-456')

          const repo = yield* WeightLogRepo
          const deleted = yield* repo.delete('wl-1', 'user-123')
          assert.isFalse(deleted)
        })
      )
    })
  })
})
