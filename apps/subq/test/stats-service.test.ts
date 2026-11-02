import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as SqlClient from 'effect/sql/SqlClient'

import { StatsDatabaseError, StatsParams } from '#shared'

import { SettingsRepoLive } from '../src/settings/settings-repo.js'
import { StatsService, StatsServiceLive } from '../src/stats/stats-service.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, insertSettings, insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(StatsServiceLive.pipe(Layer.provide(SettingsRepoLive)))

const ensureDefaultSettings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT OR IGNORE INTO user_settings (
      id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
    ) VALUES ('settings-default', 'user-123', 'lbs', 'UTC', 'complete',
              '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `
})

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
          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightStats(StatsParams.make({}), 'user-123')
          assert.deepStrictEqual(result, Option.none())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('calculates weight stats correctly', () =>
        Effect.gen(function* () {
          yield* insertWeightLog({
            id: 'w1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'w2',
            datetime: testDate('2024-01-08T10:00:00Z'),
            weight: 195,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'w3',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightStats(StatsParams.make({}), 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = yield* Effect.fromOption(result)
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
          yield* insertWeightLog({
            id: 'w1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'w2',
            datetime: testDate('2024-01-08T10:00:00Z'),
            weight: 150,
            userId: 'user-456',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightStats(StatsParams.make({}), 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = yield* Effect.fromOption(result)
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
          yield* insertWeightLog({
            id: 'w1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            weight: 190,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'w2',
            datetime: testDate('2024-01-01T10:00:00Z'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertWeightLog({
            id: 'w3',
            datetime: testDate('2024-01-08T10:00:00Z'),
            weight: 195,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightTrend(StatsParams.make({}), 'user-123')

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
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-01-02T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
            injectionSite: 'right VG',
          })
          yield* insertInjectionLog({
            id: 'i3',
            datetime: testDate('2024-01-03T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog({
            id: 'i4',
            datetime: testDate('2024-01-04T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionSiteStats(StatsParams.make({}), 'user-123')

          assert.strictEqual(result.totalInjections, 4)
          assert.strictEqual(result.sites.length, 3)
          assert.strictEqual(requireValue(result.sites[0]).site, 'left VG')
          assert.strictEqual(requireValue(result.sites[0]).count, 2)
        })
      )
    })
  })

  describe('getDoseHistory', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns persisted numeric milligram doses directly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-01-02T10:00:00Z'),
            drug: 'Tirzepatide',
            doseMg: 0.25,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i3',
            datetime: testDate('2024-01-03T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 0.5,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getDoseHistory(StatsParams.make({}), 'user-123')

          assert.strictEqual(result.points.length, 3)
          assert.strictEqual(requireValue(result.points[0]).doseMg, 200)
          assert.strictEqual(requireValue(result.points[1]).doseMg, 0.25)
          assert.strictEqual(requireValue(result.points[2]).doseMg, 0.5)
        })
      )
    })
  })

  describe('getInjectionFrequency', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns null when no data', () =>
        Effect.gen(function* () {
          yield* insertSettings({
            id: 'settings-frequency-empty',
            userId: 'user-123',
            weightUnit: 'lbs',
            timezone: 'UTC',
          })
          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionFrequency(StatsParams.make({}), 'user-123')
          assert.deepStrictEqual(result, Option.none())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('calculates frequency stats correctly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-01-04T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i3',
            datetime: testDate('2024-01-08T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i4',
            datetime: testDate('2024-01-11T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i5',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionFrequency(StatsParams.make({}), 'user-123')

          assert.isTrue(Option.isSome(result))
          const value = yield* Effect.fromOption(result)
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
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-01-01T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-01-02T10:00:00Z'),
            drug: 'Tirzepatide',
            doseMg: 0.25,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i3',
            datetime: testDate('2024-01-03T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i4',
            datetime: testDate('2024-01-04T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getDrugBreakdown(StatsParams.make({}), 'user-123')

          assert.strictEqual(result.totalInjections, 4)
          assert.strictEqual(result.drugs.length, 2)
          assert.strictEqual(requireValue(result.drugs[0]).drug, 'Semaglutide')
          assert.strictEqual(requireValue(result.drugs[0]).count, 3)
          assert.strictEqual(requireValue(result.drugs[1]).drug, 'Tirzepatide')
          assert.strictEqual(requireValue(result.drugs[1]).count, 1)
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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const result = yield* stats.getWeightStats(StatsParams.make({}), 'user-123').pipe(Effect.result)

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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const result = yield* stats.getInjectionByDayOfWeek(StatsParams.make({}), 'user-123').pipe(Effect.result)

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
          yield* insertInjectionLog({
            id: 'invalid-date',
            datetime: testDate('2024-01-01T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE injection_logs SET datetime = 'not-a-date' WHERE id = 'invalid-date'`

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const result = yield* stats.getInjectionByDayOfWeek(StatsParams.make({}), 'user-123').pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')

          if (result._tag === 'Failure') {
            assert.instanceOf(result.failure, StatsDatabaseError)
            assert.strictEqual(result.failure.operation, 'query')
          }
        })
      )
    })
  })
})
