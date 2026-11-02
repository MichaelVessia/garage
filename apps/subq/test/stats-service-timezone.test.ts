import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as SqlClient from 'effect/sql/SqlClient'

import { CalendarDate, IanaTimezone, StatsParams, UserSettings } from '#shared'

import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
import { StatsService, StatsServiceLive } from '../src/stats/stats-service.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, insertSettings, makeInitializedTestLayer } from './helpers/test-db.js'

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
  UserSettings.make({
    createdAt: DateTime.makeUnsafe('2024-01-01T00:00:00.000Z').pipe(DateTime.toDate),
    id: 'settings-counted',
    timezone,
    updatedAt: DateTime.makeUnsafe('2024-01-01T00:00:00.000Z').pipe(DateTime.toDate),
    weightUnit: 'lbs',
  })

describe('StatsService', () => {
  describe('getInjectionByDayOfWeek', () => {
    it.layer(TestLayer)((it) => {
      it.effect('groups by day of week correctly in UTC', () =>
        Effect.gen(function* () {
          yield* insertSettings({ id: 'settings-day-utc', userId: 'user-123', weightUnit: 'lbs', timezone: 'UTC' })
          // Monday Jan 1 2024, Tuesday Jan 2, Monday Jan 8
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

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: result } = yield* stats.getInjectionByDayOfWeek(StatsParams.make({}), 'user-123')

          assert.strictEqual(result.totalInjections, 3)
          const monday = yield* Effect.fromOption(Arr.findFirst(result.days, (d) => d.dayOfWeek === 1))
          const tuesday = yield* Effect.fromOption(Arr.findFirst(result.days, (d) => d.dayOfWeek === 2))
          assert.strictEqual(monday.count, 2)
          assert.strictEqual(tuesday.count, 1)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('reads the persisted timezone for day of week calculation', () =>
        Effect.gen(function* () {
          yield* insertSettings({
            id: 'settings-day-ny',
            userId: 'user-123',
            weightUnit: 'lbs',
            timezone: 'America/New_York',
          })
          // Wed Dec 4 2024 at 10:00 PM Eastern = Thu Dec 5 at 03:00 AM UTC
          // Wed Dec 11 2024 at 9:00 PM Eastern = Thu Dec 12 at 02:00 AM UTC
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-12-05T03:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-12-12T02:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: nyResult } = yield* stats.getInjectionByDayOfWeek(StatsParams.make({}), 'user-123')
          const nyWednesday = yield* Effect.fromOption(Arr.findFirst(nyResult.days, (d) => d.dayOfWeek === 3))
          assert.strictEqual(nyWednesday.count, 2)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters a local calendar day across a daylight-saving boundary', () =>
        Effect.gen(function* () {
          yield* insertSettings({
            id: 'settings-range-ny',
            userId: 'user-123',
            weightUnit: 'lbs',
            timezone: 'America/New_York',
          })
          yield* insertInjectionLog({
            id: 'before',
            datetime: testDate('2026-03-08T04:59:59Z'),
            drug: 'Semaglutide',
            doseMg: 2.5,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'first',
            datetime: testDate('2026-03-08T05:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 2.5,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'last',
            datetime: testDate('2026-03-09T03:59:59Z'),
            drug: 'Semaglutide',
            doseMg: 2.5,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'after',
            datetime: testDate('2026-03-09T04:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 2.5,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService

          const { data: result } = yield* stats.getInjectionByDayOfWeek(
            StatsParams.make({ startDate: CalendarDate.make('2026-03-08'), endDate: CalendarDate.make('2026-03-08') }),
            'user-123'
          )

          assert.strictEqual(result.totalInjections, 2)
          const sunday = yield* Effect.fromOption(Arr.findFirst(result.days, (day) => day.dayOfWeek === 0))
          assert.strictEqual(sunday.count, 2)
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
          yield* insertInjectionLog({
            id: 'snapshot-1',
            datetime: testDate('2026-03-08T06:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 2.5,
            userId: 'user-123',
          })
          const stats = yield* StatsService

          return yield* stats.getInjectionFrequency(
            StatsParams.make({ startDate: CalendarDate.make('2026-03-08'), endDate: CalendarDate.make('2026-03-08') }),
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
          yield* insertSettings({
            id: 'settings-frequency-ny',
            userId: 'user-123',
            weightUnit: 'lbs',
            timezone: 'America/New_York',
          })
          // 3 Wednesday evenings Eastern (Thursday UTC)
          yield* insertInjectionLog({
            id: 'i1',
            datetime: testDate('2024-12-05T03:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i2',
            datetime: testDate('2024-12-12T02:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'i3',
            datetime: testDate('2024-12-19T03:30:00Z'),
            drug: 'Semaglutide',
            doseMg: 200,
            userId: 'user-123',
          })

          yield* ensureDefaultSettings
          const stats = yield* StatsService
          const { data: nyResult } = yield* stats.getInjectionFrequency(StatsParams.make({}), 'user-123')
          const nyFrequency = yield* Effect.fromOption(nyResult)
          assert.strictEqual(nyFrequency.mostFrequentDayOfWeek, 3)
        })
      )
    })
  })
})
