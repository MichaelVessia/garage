import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import { SqlClient } from 'effect/unstable/sql'

import { CalendarDate, IanaTimezone, StatsDatabaseError, UserSettings } from '#shared'

import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
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

const makeSettings = (timezone: IanaTimezone) =>
  new UserSettings({
    createdAt: DateTime.makeUnsafe('2024-01-01T00:00:00.000Z').pipe(DateTime.toDate),
    id: 'settings-counted',
    timezone,
    updatedAt: DateTime.makeUnsafe('2024-01-01T00:00:00.000Z').pipe(DateTime.toDate),
    weightUnit: 'lbs',
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
          const { data: result } = yield* stats.getWeightStats({}, 'user-123')
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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightStats({}, 'user-123')

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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightStats({}, 'user-123')

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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getWeightTrend({}, 'user-123')

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
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123', {
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Semaglutide', 200, 'user-123', {
            injectionSite: 'right VG',
          })
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Semaglutide', 200, 'user-123', {
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog('i4', testDate('2024-01-04T10:00:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionSiteStats({}, 'user-123')

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
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Tirzepatide', 0.25, 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Semaglutide', 0.5, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getDoseHistory({}, 'user-123')

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
          yield* insertSettings('settings-frequency-empty', 'user-123', 'lbs', 'UTC')
          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionFrequency({}, 'user-123')
          assert.deepStrictEqual(result, Option.none())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('calculates frequency stats correctly', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-04T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-08T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i4', testDate('2024-01-11T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i5', testDate('2024-01-15T10:00:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionFrequency({}, 'user-123')

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
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Tirzepatide', 0.25, 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-03T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i4', testDate('2024-01-04T10:00:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getDrugBreakdown({}, 'user-123')

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

  describe('getInjectionByDayOfWeek', () => {
    it.layer(TestLayer)((it) => {
      it.effect('groups by day of week correctly in UTC', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-day-utc', 'user-123', 'lbs', 'UTC')
          // Monday Jan 1 2024, Tuesday Jan 2, Monday Jan 8
          yield* insertInjectionLog('i1', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-01-02T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-01-08T10:00:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionByDayOfWeek({}, 'user-123')

          assert.strictEqual(result.totalInjections, 3)
          const monday = result.days.find((d) => d.dayOfWeek === 1)
          const tuesday = result.days.find((d) => d.dayOfWeek === 2)
          assert.strictEqual(requireValue(monday).count, 2)
          assert.strictEqual(requireValue(tuesday).count, 1)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('reads the persisted timezone for day of week calculation', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-day-ny', 'user-123', 'lbs', 'America/New_York')
          // Wed Dec 4 2024 at 10:00 PM Eastern = Thu Dec 5 at 03:00 AM UTC
          // Wed Dec 11 2024 at 9:00 PM Eastern = Thu Dec 12 at 02:00 AM UTC
          yield* insertInjectionLog('i1', testDate('2024-12-05T03:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-12-12T02:00:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: nyResult } = yield* stats.getInjectionByDayOfWeek({}, 'user-123')
          const nyWednesday = nyResult.days.find((d) => d.dayOfWeek === 3)
          assert.strictEqual(requireValue(nyWednesday).count, 2)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters a local calendar day across a daylight-saving boundary', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-range-ny', 'user-123', 'lbs', 'America/New_York')
          yield* insertInjectionLog('before', testDate('2026-03-08T04:59:59Z'), 'Semaglutide', 2.5, 'user-123')
          yield* insertInjectionLog('first', testDate('2026-03-08T05:00:00Z'), 'Semaglutide', 2.5, 'user-123')
          yield* insertInjectionLog('last', testDate('2026-03-09T03:59:59Z'), 'Semaglutide', 2.5, 'user-123')
          yield* insertInjectionLog('after', testDate('2026-03-09T04:00:00Z'), 'Semaglutide', 2.5, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionByDayOfWeek(
            { startDate: CalendarDate.make('2026-03-08'), endDate: CalendarDate.make('2026-03-08') },
            'user-123'
          )

          assert.strictEqual(result.totalInjections, 2)
          assert.strictEqual(requireValue(result.days.find((day) => day.dayOfWeek === 0)).count, 2)
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

          yield* ensureDefaultSettings
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
          yield* insertInjectionLog('invalid-date', testDate('2024-01-01T10:00:00Z'), 'Semaglutide', 200, 'user-123')
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE injection_logs SET datetime = 'not-a-date' WHERE id = 'invalid-date'`

          yield* ensureDefaultSettings
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

  describe('timezone snapshots', () => {
    it.effect('loads one persisted timezone and reuses it for filtering and projection', () =>
      Effect.gen(function* () {
        const reads = yield* Ref.make(0)
        const firstTimezone = IanaTimezone.make('America/New_York')
        const secondTimezone = IanaTimezone.make('Pacific/Auckland')
        const settingsRepo = SettingsRepo.of({
          get: () =>
            Ref.getAndUpdate(reads, (count) => count + 1).pipe(
              Effect.map((count) => Option.some(makeSettings(count === 0 ? firstTimezone : secondTimezone)))
            ),
          initializeTimezone: (_userId, timezone) => Effect.succeed(makeSettings(timezone)),
          upsert: () => Effect.succeed(makeSettings(firstTimezone)),
        })
        const layer = makeInitializedTestLayer(
          StatsServiceLive.pipe(Layer.provide(Layer.succeed(SettingsRepo, settingsRepo)))
        )

        const result = yield* Effect.gen(function* () {
          yield* insertInjectionLog('snapshot-1', testDate('2026-03-08T06:00:00Z'), 'Semaglutide', 2.5, 'user-123')
          const stats = yield* StatsService
          return yield* stats.getInjectionFrequency(
            { startDate: CalendarDate.make('2026-03-08'), endDate: CalendarDate.make('2026-03-08') },
            'user-123'
          )
        }).pipe(Effect.provide(layer))

        assert.strictEqual(yield* Ref.get(reads), 1)
        assert.strictEqual(result.timezone, firstTimezone)
        assert.isTrue(Option.isSome(result.data))
      })
    )
  })

  describe('getInjectionFrequency timezone handling', () => {
    it.layer(TestLayer)((it) => {
      it.effect('uses the persisted timezone for most frequent day of week', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-frequency-ny', 'user-123', 'lbs', 'America/New_York')
          // 3 Wednesday evenings Eastern (Thursday UTC)
          yield* insertInjectionLog('i1', testDate('2024-12-05T03:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i2', testDate('2024-12-12T02:00:00Z'), 'Semaglutide', 200, 'user-123')
          yield* insertInjectionLog('i3', testDate('2024-12-19T03:30:00Z'), 'Semaglutide', 200, 'user-123')

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: nyResult } = yield* stats.getInjectionFrequency({}, 'user-123')
          assert.strictEqual(Option.getOrThrow(nyResult).mostFrequentDayOfWeek, 3)
        })
      )
    })
  })
})
