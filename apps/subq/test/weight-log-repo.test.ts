import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { Notes, Weight, WeightLogCreate, WeightLogId, WeightLogUpdate } from '#shared'

import { WeightLogRepo, WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)

describe('WeightLogRepo', () => {
  describe('create', () => {
    it.layer(TestLayer)((it) => {
      it.effect('creates a weight log entry with all fields', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo

          const created = yield* repo.create(
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185.5),
              notes: Option.some(Notes.make('Morning weigh-in')),
            }),
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
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            }),
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
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            }),
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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 180,
            userId: 'user-456',
          })

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
          yield* insertWeightLog({
            id: 'wl-2',
            datetime: testDate('2024-02-01T00:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-01T00:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-3',
            datetime: testDate('2024-03-01T00:00:00Z'),
            weight: 185,
            userId: 'user-123',
          })

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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-03-01T00:00:00Z'),
            weight: 175,
            userId: 'user-456',
          })

          const repo = yield* WeightLogRepo
          const found = yield* repo.mostRecent('user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })
  })

  describe('listChronological', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns the complete user history in ascending datetime order', () =>
        Effect.gen(function* () {
          yield* insertWeightLog({
            id: 'wl-latest',
            datetime: testDate('2024-03-01T00:00:00Z'),
            weight: 180,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-earliest',
            datetime: testDate('2024-01-01T00:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-other',
            datetime: testDate('2023-01-01T00:00:00Z'),
            weight: 500,
            userId: 'user-456',
          })
          yield* insertWeightLog({
            id: 'wl-middle',
            datetime: testDate('2024-02-01T00:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })

          const repo = yield* WeightLogRepo
          const history = yield* repo.listChronological('user-123')

          assert.deepStrictEqual(
            Arr.map(history, (entry) => entry.id),
            ['wl-earliest', 'wl-middle', 'wl-latest']
          )
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
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185),
              notes: Option.none(),
            }),
            'user-123'
          )

          const updated = yield* repo.update(
            WeightLogUpdate.make({
              id: created.id,
              weight: Weight.make(184),
              notes: Option.some(Notes.make('After workout')),
            }),
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
              WeightLogUpdate.make({
                id: WeightLogId.make('non-existent'),
                weight: Weight.make(180),
                notes: Option.none(),
              }),
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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 180,
            userId: 'user-456',
          })

          const repo = yield* WeightLogRepo

          const result = yield* repo
            .update(
              WeightLogUpdate.make({
                id: WeightLogId.make('wl-1'),
                weight: Weight.make(999),
                notes: Option.none(),
              }),
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
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(185),
              notes: Option.none(),
            }),
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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 180,
            userId: 'user-456',
          })

          const repo = yield* WeightLogRepo
          const deleted = yield* repo.delete('wl-1', 'user-123')
          assert.isFalse(deleted)
        })
      )
    })
  })
})
