import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { SqlClient } from 'effect/unstable/sql'

import { StatsDatabaseError } from '#shared'

import { StatsService, StatsServiceLive } from '../src/stats/stats-service.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(StatsServiceLive)

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('StatsService', () => {
  describe('getWeightStats', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns null when no data', () =>
        Effect.gen(function* () {
          const stats = yield* StatsService
          const result = yield* stats.getWeightStats({}, 'user-123')
          assert.deepStrictEqual(result, Option.none())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('calculates weight stats correctly', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('w1', testDate('2024-01-01T10:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('w2', testDate('2024-01-08T10:00:00Z'), 195, 'user-123')
          yield* insertWeightLog('w3', testDate('2024-01-15T10:00:00Z'), 190, 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getWeightStats({}, 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = Option.getOrThrow(result)
          assert.strictEqual(value.minWeight, 190)
          assert.strictEqual(value.maxWeight, 200)
          assert.strictEqual(value.avgWeight, 195)
          assert.closeTo(value.rateOfChange, -5, 0.005)
          assert.strictEqual(value.entryCount, 3)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only includes data for the specified user', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('w1', testDate('2024-01-01T10:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('w2', testDate('2024-01-08T10:00:00Z'), 150, 'user-456')

          const stats = yield* StatsService
          const result = yield* stats.getWeightStats({}, 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = Option.getOrThrow(result)
          assert.strictEqual(value.entryCount, 1)
          assert.strictEqual(value.minWeight, 200)
        })
      )
    })
  })

  describe('getWeightTrend', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns trend points sorted by date', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('w1', testDate('2024-01-15T10:00:00Z'), 190, 'user-123')
          yield* insertWeightLog('w2', testDate('2024-01-01T10:00:00Z'), 200, 'user-123')
          yield* insertWeightLog('w3', testDate('2024-01-08T10:00:00Z'), 195, 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getWeightTrend({}, 'user-123')

          assert.strictEqual(result.points.length, 3)
          assert.strictEqual(requireValue(result.points[0]).weight, 200)
          assert.strictEqual(requireValue(result.points[1]).weight, 195)
          assert.strictEqual(requireValue(result.points[2]).weight, 190)
          assert.closeTo(requireValue(result.trendLine).startWeight, 200, 0.005)
          assert.closeTo(requireValue(result.trendLine).endWeight, 190, 0.005)
        })
      )
    })
  })

  describe('getInjectionSiteStats', () => {
    it.layer(TestLayer)((it) => {
      it.effect('groups injection sites correctly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123', {
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Test', '200mg', 'user-123', {
            injectionSite: 'right VG',
          })
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Test', '200mg', 'user-123', {
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog('i4', testDate('2024-01-04T10:00:00Z'), 'Test', '200mg', 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getInjectionSiteStats({}, 'user-123')

          assert.strictEqual(result.totalInjections, 4)
          assert.strictEqual(result.sites.length, 3)
          assert.strictEqual(requireValue(result.sites[0]).site, 'left VG')
          assert.strictEqual(requireValue(result.sites[0]).count, 2)
        })
      )
    })
  })

  describe('getDosageHistory', () => {
    it.layer(TestLayer)((it) => {
      it.effect('extracts dosage values from strings', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'BPC', '250mcg', 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Test', '0.5ml', 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getDosageHistory({}, 'user-123')

          assert.strictEqual(result.points.length, 3)
          assert.strictEqual(requireValue(result.points[0]).dosageValue, 200)
          assert.strictEqual(requireValue(result.points[1]).dosageValue, 250)
          assert.strictEqual(requireValue(result.points[2]).dosageValue, 0.5)
        })
      )
    })
  })

  describe('getInjectionFrequency', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns null when no data', () =>
        Effect.gen(function* () {
          const stats = yield* StatsService
          const result = yield* stats.getInjectionFrequency({}, 'user-123')
          assert.deepStrictEqual(result, Option.none())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('calculates frequency stats correctly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-04T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-08T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i4', testDate('2024-01-11T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i5', testDate('2024-01-15T10:00:00Z'), 'Test', '200mg', 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getInjectionFrequency({}, 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = Option.getOrThrow(result)
          assert.strictEqual(value.totalInjections, 5)
          assert.strictEqual(value.avgDaysBetween, 3.5)
        })
      )
    })
  })

  describe('getDrugBreakdown', () => {
    it.layer(TestLayer)((it) => {
      it.effect('groups drugs correctly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Testosterone', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'BPC-157', '250mcg', 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Testosterone', '200mg', 'user-123')
          yield* insertInjectionLog('i4', testDate('2024-01-04T10:00:00Z'), 'Testosterone', '200mg', 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getDrugBreakdown({}, 'user-123')

          assert.strictEqual(result.totalInjections, 4)
          assert.strictEqual(result.drugs.length, 2)
          assert.strictEqual(requireValue(result.drugs[0]).drug, 'Testosterone')
          assert.strictEqual(requireValue(result.drugs[0]).count, 3)
          assert.strictEqual(requireValue(result.drugs[1]).drug, 'BPC-157')
          assert.strictEqual(requireValue(result.drugs[1]).count, 1)
        })
      )
    })
  })

  describe('getInjectionByDayOfWeek', () => {
    it.layer(TestLayer)((it) => {
      it.effect('groups by day of week correctly in UTC', () =>
        Effect.gen(function* () {
          // Monday Jan 1 2024, Tuesday Jan 2, Monday Jan 8
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-08T10:00:00Z'), 'Test', '200mg', 'user-123')

          const stats = yield* StatsService
          const result = yield* stats.getInjectionByDayOfWeek({}, 'user-123')

          assert.strictEqual(result.totalInjections, 3)
          const monday = result.days.find((d) => d.dayOfWeek === 1)
          const tuesday = result.days.find((d) => d.dayOfWeek === 2)
          assert.strictEqual(requireValue(monday).count, 2)
          assert.strictEqual(requireValue(tuesday).count, 1)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('respects timezone parameter for day of week calculation', () =>
        Effect.gen(function* () {
          // Wed Dec 4 2024 at 10:00 PM Eastern = Thu Dec 5 at 03:00 AM UTC
          // Wed Dec 11 2024 at 9:00 PM Eastern = Thu Dec 12 at 02:00 AM UTC
          yield* insertInjectionLog('i1', testDate('2024-12-05T03:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-12-12T02:00:00Z'), 'Test', '200mg', 'user-123')

          const stats = yield* StatsService

          // Without timezone (defaults to UTC), these should be Thursday
          const utcResult = yield* stats.getInjectionByDayOfWeek({}, 'user-123')
          const utcThursday = utcResult.days.find((d) => d.dayOfWeek === 4)
          assert.strictEqual(requireValue(utcThursday).count, 2)

          // With America/New_York timezone, these should be Wednesday
          const nyResult = yield* stats.getInjectionByDayOfWeek({ timezone: 'America/New_York' }, 'user-123')
          const nyWednesday = nyResult.days.find((d) => d.dayOfWeek === 3)
          assert.strictEqual(requireValue(nyWednesday).count, 2)
        })
      )
    })
  })

  describe('typed failures', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns SQL failures in the StatsDatabaseError channel', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`DROP TABLE weight_logs`

          const stats = yield* StatsService
          const result = yield* stats.getWeightStats({}, 'user-123').pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.instanceOf(result.failure, StatsDatabaseError)
            assert.strictEqual(result.failure.operation, 'query')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns injection SQL failures in the StatsDatabaseError channel', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`DROP TABLE injection_logs`

          const stats = yield* StatsService
          const result = yield* stats.getInjectionByDayOfWeek({}, 'user-123').pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.instanceOf(result.failure, StatsDatabaseError)
            assert.strictEqual(result.failure.operation, 'query')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns row decode failures in the StatsDatabaseError channel', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('invalid-date', testDate('2024-01-01T10:00:00Z'), 'Test', '200mg', 'user-123')
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE injection_logs SET datetime = 'not-a-date' WHERE id = 'invalid-date'`

          const stats = yield* StatsService
          const result = yield* stats.getInjectionByDayOfWeek({}, 'user-123').pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.instanceOf(result.failure, StatsDatabaseError)
            assert.strictEqual(result.failure.operation, 'query')
          }
        })
      )
    })
  })

  describe('getInjectionFrequency timezone handling', () => {
    it.layer(TestLayer)((it) => {
      it.effect('respects timezone for most frequent day of week', () =>
        Effect.gen(function* () {
          // 3 Wednesday evenings Eastern (Thursday UTC)
          yield* insertInjectionLog('i1', testDate('2024-12-05T03:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-12-12T02:00:00Z'), 'Test', '200mg', 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-12-19T03:30:00Z'), 'Test', '200mg', 'user-123')

          const stats = yield* StatsService

          // Without timezone, most frequent is Thursday (4)
          const utcResult = yield* stats.getInjectionFrequency({}, 'user-123')
          assert.strictEqual(Option.getOrThrow(utcResult).mostFrequentDayOfWeek, 4)

          // With America/New_York, most frequent is Wednesday (3)
          const nyResult = yield* stats.getInjectionFrequency({ timezone: 'America/New_York' }, 'user-123')
          assert.strictEqual(Option.getOrThrow(nyResult).mostFrequentDayOfWeek, 3)
        })
      )
    })
  })
})
