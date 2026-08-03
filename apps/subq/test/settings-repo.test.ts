import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import { IanaTimezone, UserSettingsUpdate } from '#shared'

import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
import { insertSettings, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(SettingsRepoLive)

const PlannedRows = Schema.Struct({
  injection_datetime: Schema.String,
  schedule_start: Schema.String,
  goal_start: Schema.String,
  goal_target: Schema.String,
})

describe('SettingsRepo', () => {
  it.effect('uses one persisted timezone winner when initialization races', () =>
    Effect.gen(function* () {
      const userId = 'user-concurrent-timezone'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-concurrent', 'Weekly', 'Semaglutide', 'weekly', '2026-01-01T02:00:00.000Z', 1, ${userId}, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      const initialized = yield* Effect.all(
        [
          repo.initializeTimezone(userId, IanaTimezone.make('America/New_York')),
          repo.initializeTimezone(userId, IanaTimezone.make('Pacific/Auckland')),
        ],
        { concurrency: 'unbounded' }
      )
      const rows = yield* sql`
        SELECT timezone, timezone_migration_state,
          (SELECT start_date FROM injection_schedules WHERE id = 'schedule-concurrent') AS start_date
        FROM user_settings
        WHERE user_id = ${userId}
      `
      const state = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            start_date: Schema.String,
            timezone: IanaTimezone,
            timezone_migration_state: Schema.String,
          })
        )
      )(rows)
      const [winner] = state

      assert.lengthOf(state, 1)
      assert.isDefined(winner)
      if (winner === undefined) {
        return
      }
      assert.strictEqual(initialized[0].timezone, winner.timezone)
      assert.strictEqual(initialized[1].timezone, winner.timezone)
      assert.strictEqual(winner.timezone_migration_state, 'complete')
      assert.strictEqual(winner.start_date, winner.timezone === 'America/New_York' ? '2025-12-31' : '2026-01-01')
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('resumes a durable pending claim with the persisted winner timezone', () =>
    Effect.gen(function* () {
      const userId = 'user-pending-claim'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* sql`
        INSERT INTO user_settings (id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at)
        VALUES ('settings-pending', ${userId}, 'lbs', 'America/New_York', 'pending', ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-pending', 'Weekly', 'Semaglutide', 'weekly', '2026-01-01T02:00:00.000Z', 1, ${userId}, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      const settings = yield* repo.initializeTimezone(userId, IanaTimezone.make('Pacific/Auckland'))
      const rows = yield* sql`
        SELECT timezone, timezone_migration_state, (SELECT start_date FROM injection_schedules WHERE id = 'schedule-pending') AS start_date
        FROM user_settings
        WHERE user_id = ${userId}
      `
      const state = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            start_date: Schema.String,
            timezone: IanaTimezone,
            timezone_migration_state: Schema.String,
          })
        )
      )(rows)

      assert.strictEqual(settings.timezone, 'America/New_York')
      assert.deepStrictEqual(state, [
        {
          start_date: '2025-12-31',
          timezone: IanaTimezone.make('America/New_York'),
          timezone_migration_state: 'complete',
        },
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('uses calendar_date_migrated as explicit pre-0014 bare-date provenance', () =>
    Effect.gen(function* () {
      const userId = 'user-partial-retry'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* sql`
        INSERT INTO user_settings (id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at)
        VALUES ('settings-partial', ${userId}, 'lbs', 'Pacific/Auckland', 'pending', ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO user_goals (
          id, user_id, goal_weight, starting_weight, starting_date, target_date,
          calendar_date_migrated, is_active, created_at, updated_at
        ) VALUES ('goal-modern', ${userId}, 170, 200, '2026-01-01', '2026-04-04', 1, 1, ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO user_goals (
          id, user_id, goal_weight, starting_weight, starting_date, target_date,
          is_active, created_at, updated_at
        ) VALUES ('goal-legacy', ${userId}, 170, 200, '2026-01-01', '2026-04-04', 1, ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-still-pending', 'Weekly', 'Semaglutide', 'weekly', '2026-01-01T02:00:00.000Z', 1, ${userId}, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      yield* repo.initializeTimezone(userId, IanaTimezone.make('America/New_York'))
      const rows = yield* sql`
        SELECT id, starting_date, target_date, calendar_date_migrated
        FROM user_goals WHERE user_id = ${userId} ORDER BY id
      `
      const state = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            calendar_date_migrated: Schema.Number,
            id: Schema.String,
            starting_date: Schema.String,
            target_date: Schema.String,
          })
        )
      )(rows)

      assert.deepStrictEqual(state, [
        {
          calendar_date_migrated: 1,
          id: 'goal-legacy',
          starting_date: '2026-01-02',
          target_date: '2026-04-05',
        },
        {
          calendar_date_migrated: 1,
          id: 'goal-modern',
          starting_date: '2026-01-01',
          target_date: '2026-04-04',
        },
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('initializes concurrent users independently under the unique user constraint', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES
          ('schedule-user-a', 'Weekly A', 'Semaglutide', 'weekly', '2026-01-01T02:00:00.000Z', 1, 'user-a', ${audit}, ${audit}),
          ('schedule-user-b', 'Weekly B', 'Semaglutide', 'weekly', '2026-01-01T02:00:00.000Z', 1, 'user-b', ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      yield* Effect.all(
        [
          repo.initializeTimezone('user-a', IanaTimezone.make('America/New_York')),
          repo.initializeTimezone('user-b', IanaTimezone.make('Pacific/Auckland')),
        ],
        { concurrency: 'unbounded' }
      )
      const rows = yield* sql`
        SELECT id, start_date FROM injection_schedules WHERE id IN ('schedule-user-a', 'schedule-user-b') ORDER BY id
      `
      const dates = yield* Schema.decodeUnknownEffect(
        Schema.Array(Schema.Struct({ id: Schema.String, start_date: Schema.String }))
      )(rows)

      assert.deepStrictEqual(dates, [
        { id: 'schedule-user-a', start_date: '2025-12-31' },
        { id: 'schedule-user-b', start_date: '2026-01-01' },
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('recovers lossy legacy date-only goals across positive, negative, and zero offsets', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* insertSettings('settings-positive', 'user-positive', 'lbs')
      yield* insertSettings('settings-negative', 'user-negative', 'lbs')
      yield* insertSettings('settings-zero', 'user-zero', 'lbs')
      yield* sql`
        INSERT INTO user_goals (
          id, user_id, goal_weight, starting_weight, starting_date, target_date, is_active, created_at, updated_at
        ) VALUES
          ('goal-positive', 'user-positive', 170, 200, '2026-01-01', '2026-04-04', 1, ${audit}, ${audit}),
          ('goal-negative', 'user-negative', 170, 200, '2026-03-08', '2026-11-01', 1, ${audit}, ${audit}),
          ('goal-zero', 'user-zero', 170, 200, '2026-01-02', NULL, 1, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      yield* Effect.all(
        [
          repo.initializeTimezone('user-positive', IanaTimezone.make('Pacific/Auckland')),
          repo.initializeTimezone('user-negative', IanaTimezone.make('America/New_York')),
          repo.initializeTimezone('user-zero', IanaTimezone.make('UTC')),
        ],
        { concurrency: 'unbounded' }
      )
      const rows = yield* sql`
        SELECT id, starting_date, target_date FROM user_goals ORDER BY id
      `
      const dates = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            starting_date: Schema.String,
            target_date: Schema.NullOr(Schema.String),
          })
        )
      )(rows)

      assert.deepStrictEqual(dates, [
        { id: 'goal-negative', starting_date: '2026-03-08', target_date: '2026-11-01' },
        { id: 'goal-positive', starting_date: '2026-01-02', target_date: '2026-04-05' },
        { id: 'goal-zero', starting_date: '2026-01-02', target_date: null },
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('initializes the persisted timezone and safely converts legacy planned timestamps', () =>
    Effect.gen(function* () {
      const userId = 'user-legacy-timezone'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* insertSettings('settings-1', userId, 'kg')
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-1', 'Weekly', 'Semaglutide', 'weekly', '2024-12-05T03:00:00.000Z', 1, ${userId}, ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, is_active, created_at, updated_at)
        VALUES ('goal-1', ${userId}, 170, 200, '2024-11-01', '2025-03-10T03:30:00.000Z', 1, ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO injection_logs (id, datetime, drug, dose_mg, user_id, created_at, updated_at)
        VALUES ('injection-1', '2024-12-05T03:00:00.000Z', 'Semaglutide', 2.5, ${userId}, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      const settings = yield* repo.initializeTimezone(userId, IanaTimezone.make('America/New_York'))
      const rows = yield* sql`
        SELECT
          (SELECT datetime FROM injection_logs WHERE id = 'injection-1') AS injection_datetime,
          (SELECT start_date FROM injection_schedules WHERE id = 'schedule-1') AS schedule_start,
          (SELECT starting_date FROM user_goals WHERE id = 'goal-1') AS goal_start,
          (SELECT target_date FROM user_goals WHERE id = 'goal-1') AS goal_target
      `
      const planned = yield* Schema.decodeUnknownEffect(Schema.Array(PlannedRows))(rows)
      const [row] = planned

      assert.isDefined(row)
      if (row === undefined) {
        return
      }
      assert.strictEqual(settings.timezone, 'America/New_York')
      assert.strictEqual(settings.weightUnit, 'kg')
      assert.strictEqual(row.schedule_start, '2024-12-04')
      assert.strictEqual(row.goal_start, '2024-11-01')
      assert.strictEqual(row.goal_target, '2025-03-09')
      assert.strictEqual(row.injection_datetime, '2024-12-05T03:00:00.000Z')
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('atomically creates and merges concurrent missing-row partial upserts', () =>
    Effect.gen(function* () {
      const userId = 'user-missing-partial-upserts'
      const repo = yield* SettingsRepo
      const weightUpdate = yield* repo
        .upsert(userId, new UserSettingsUpdate({ weightUnit: 'kg' }))
        .pipe(Effect.forkChild)

      // Let the weight-only caller observe/claim the missing row before the
      // timezone caller races in, making the old read-then-insert failure deterministic.
      yield* Effect.yieldNow
      const timezoneSettings = yield* repo.upsert(
        userId,
        new UserSettingsUpdate({ timezone: IanaTimezone.make('Pacific/Auckland') })
      )
      const weightSettings = yield* Fiber.join(weightUpdate)
      const persisted = yield* repo.get(userId)

      assert.strictEqual(timezoneSettings.timezone, 'Pacific/Auckland')
      assert.strictEqual(weightSettings.weightUnit, 'kg')
      assert.strictEqual(Option.isSome(persisted), true)
      if (Option.isSome(persisted)) {
        assert.strictEqual(persisted.value.timezone, 'Pacific/Auckland')
        assert.strictEqual(persisted.value.weightUnit, 'kg')
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('atomically merges concurrent partial timezone and weight-unit updates', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const repo = yield* SettingsRepo
      const userIds = Array.from({ length: 12 }, (_, index) => `user-partial-upsert-${index}`)

      yield* Effect.forEach(
        userIds,
        (userId, index) => insertSettings(`settings-partial-upsert-${index}`, userId, 'lbs', 'UTC'),
        { concurrency: 1, discard: true }
      )
      yield* Effect.forEach(
        userIds,
        (userId) =>
          Effect.all(
            [
              repo.upsert(userId, new UserSettingsUpdate({ timezone: IanaTimezone.make('Pacific/Auckland') })),
              repo.upsert(userId, new UserSettingsUpdate({ weightUnit: 'kg' })),
            ],
            { concurrency: 'unbounded', discard: true }
          ),
        { concurrency: 'unbounded', discard: true }
      )

      const rows = yield* sql`
        SELECT user_id, timezone, weight_unit
        FROM user_settings
        WHERE user_id LIKE 'user-partial-upsert-%'
        ORDER BY user_id
      `
      const settings = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            timezone: IanaTimezone,
            user_id: Schema.String,
            weight_unit: Schema.Literals(['lbs', 'kg'] as const),
          })
        )
      )(rows)

      assert.lengthOf(settings, userIds.length)
      for (const row of settings) {
        assert.strictEqual(row.timezone, 'Pacific/Auckland')
        assert.strictEqual(row.weight_unit, 'kg')
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('does not overwrite an initialized or later explicitly selected timezone', () =>
    Effect.gen(function* () {
      const userId = 'user-explicit-timezone'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* insertSettings('settings-explicit', userId, 'lbs', 'America/Los_Angeles')
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-explicit', 'Weekly', 'Semaglutide', 'weekly', '2026-01-15', 1, ${userId}, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      const initialized = yield* repo.initializeTimezone(userId, IanaTimezone.make('America/New_York'))
      const updated = yield* repo.upsert(
        userId,
        new UserSettingsUpdate({ timezone: IanaTimezone.make('Pacific/Auckland') })
      )
      const startRows = yield* sql`SELECT start_date FROM injection_schedules WHERE id = 'schedule-explicit'`
      const starts = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ start_date: Schema.String })))(
        startRows
      )

      assert.strictEqual(initialized.timezone, 'America/Los_Angeles')
      assert.strictEqual(updated.timezone, 'Pacific/Auckland')
      assert.strictEqual(starts[0]?.start_date, '2026-01-15')
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('reports the offending legacy value before changing any planned date', () =>
    Effect.gen(function* () {
      const userId = 'user-invalid-legacy-date'
      const sql = yield* SqlClient.SqlClient
      const audit = '2026-01-01T00:00:00.000Z'
      yield* insertSettings('settings-invalid', userId, 'lbs')
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, frequency, start_date, is_active, user_id, created_at, updated_at)
        VALUES ('schedule-valid', 'Valid', 'Semaglutide', 'weekly', '2026-01-15T05:00:00.000Z', 1, ${userId}, ${audit}, ${audit})
      `
      yield* sql`
        INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, is_active, created_at, updated_at)
        VALUES ('goal-invalid', ${userId}, 170, 200, 'not-a-date', NULL, 1, ${audit}, ${audit})
      `

      const repo = yield* SettingsRepo
      const result = yield* repo.initializeTimezone(userId, IanaTimezone.make('America/New_York')).pipe(Effect.result)
      const rows = yield* sql`
        SELECT
          (SELECT start_date FROM injection_schedules WHERE id = 'schedule-valid') AS schedule_start,
          timezone,
          timezone_migration_state
        FROM user_settings
        WHERE user_id = ${userId}
      `
      const state = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.Struct({
            schedule_start: Schema.String,
            timezone: IanaTimezone,
            timezone_migration_state: Schema.String,
          })
        )
      )(rows)

      assert.strictEqual(result._tag, 'Failure')
      if (result._tag === 'Failure') {
        assert.strictEqual(result.failure._tag, 'SettingsTemporalMigrationError')
        if (result.failure._tag === 'SettingsTemporalMigrationError') {
          assert.strictEqual(result.failure.recordId, 'goal-invalid')
          assert.strictEqual(result.failure.field, 'starting_date')
          assert.strictEqual(result.failure.value, 'not-a-date')
        }
      }
      assert.strictEqual(state[0]?.schedule_start, '2026-01-15T05:00:00.000Z')
      assert.strictEqual(state[0]?.timezone, 'America/New_York')
      assert.strictEqual(state[0]?.timezone_migration_state, 'pending')
    }).pipe(Effect.provide(TestLayer))
  )
})
