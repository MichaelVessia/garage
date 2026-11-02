import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { CalendarDate, IanaTimezone, Limit, Offset, Weight, WeightLogCreate, WeightLogListParams } from '#shared'

import { WeightLogRepo, WeightLogRepoLive } from '../src/weight/weight-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)
const timezone = IanaTimezone.make('UTC')

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }

  return value
}

describe('WeightLogRepo', () => {
  describe('nearestToDate', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none for an empty table', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', CalendarDate.make('2024-01-15'), timezone)
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns the entry closest to the target date when the target is between two entries', () =>
        Effect.gen(function* () {
          yield* insertWeightLog({
            id: 'wl-before',
            datetime: testDate('2024-01-01T00:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-after',
            datetime: testDate('2024-01-20T00:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })

          const repo = yield* WeightLogRepo
          // Closer to 2024-01-01 (4 days away) than to 2024-01-20 (15 days away)
          const found = yield* repo.nearestToDate('user-123', CalendarDate.make('2024-01-05'), timezone)
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
          yield* insertWeightLog({
            id: 'wl-before',
            datetime: testDate('2024-01-01T00:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-after',
            datetime: testDate('2024-01-20T00:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })

          const repo = yield* WeightLogRepo
          // Closer to 2024-01-20 (2 days away) than to 2024-01-01 (17 days away)
          const found = yield* repo.nearestToDate('user-123', CalendarDate.make('2024-01-18'), timezone)
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
          yield* insertWeightLog({
            id: 'wl-exact',
            datetime: testDate('2024-01-15T08:00:00Z'),
            weight: 180,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-far',
            datetime: testDate('2024-06-01T00:00:00Z'),
            weight: 170,
            userId: 'user-123',
          })

          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', CalendarDate.make('2024-01-15'), timezone)
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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-15T00:00:00Z'),
            weight: 180,
            userId: 'user-456',
          })

          const repo = yield* WeightLogRepo
          const found = yield* repo.nearestToDate('user-123', CalendarDate.make('2024-01-15'), timezone)
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
              WeightLogCreate.make({
                datetime: DateTime.makeUnsafe(`2024-01-${15 + i}T10:00:00Z`),
                weight: Weight.make(180 + i),
                notes: Option.none(),
              }),
              'user-123'
            )
          }

          const page1 = yield* repo.list(
            WeightLogListParams.make({ limit: Limit.make(2), offset: Offset.make(0) }),
            'user-123'
          )

          assert.strictEqual(page1.length, 2)
          // Should be sorted by datetime DESC, so newest first
          assert.strictEqual(requireValue(page1[0]).weight, 184)
          assert.strictEqual(requireValue(page1[1]).weight, 183)

          const page2 = yield* repo.list(
            WeightLogListParams.make({ limit: Limit.make(2), offset: Offset.make(2) }),
            'user-123'
          )

          assert.strictEqual(page2.length, 2)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters by date range', () =>
        Effect.gen(function* () {
          const repo = yield* WeightLogRepo
          yield* repo.create(
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-10T10:00:00Z'),
              weight: Weight.make(180),
              notes: Option.none(),
            }),
            'user-123'
          )
          yield* repo.create(
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              weight: Weight.make(181),
              notes: Option.none(),
            }),
            'user-123'
          )
          yield* repo.create(
            WeightLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-20T10:00:00Z'),
              weight: Weight.make(182),
              notes: Option.none(),
            }),
            'user-123'
          )

          const filtered = yield* repo.list(
            WeightLogListParams.make({
              limit: Limit.make(50),
              offset: Offset.make(0),
              startDate: DateTime.makeUnsafe('2024-01-12T00:00:00Z'),
              endDate: DateTime.makeUnsafe('2024-01-18T00:00:00Z'),
            }),
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
          yield* insertWeightLog({
            id: 'wl-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 180,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'wl-2',
            datetime: testDate('2024-01-16T10:00:00Z'),
            weight: 175,
            userId: 'user-456',
          })
          yield* insertWeightLog({
            id: 'wl-3',
            datetime: testDate('2024-01-17T10:00:00Z'),
            weight: 185,
            userId: 'user-123',
          })

          const repo = yield* WeightLogRepo

          const logs = yield* repo.list(
            WeightLogListParams.make({ limit: Limit.make(50), offset: Offset.make(0) }),
            'user-123'
          )

          assert.strictEqual(logs.length, 2)
          assert.isTrue(Arr.every(logs, (l) => l.id === 'wl-1' || l.id === 'wl-3'))
        })
      )
    })
  })
})
