import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'
import * as TestClock from 'effect/testing/TestClock'

import { DataExport, DataExportTemporalMigrationRequired } from '#shared'

import { DataExportService, DataExportServiceLive } from '../src/data-export/data-export-service.js'
import { testDate } from './helpers/dates.js'
import {
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  insertSettings,
  insertWeightLog,
  makeInitializedTestLayer,
} from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(DataExportServiceLive)

const ensureExportReady = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT OR IGNORE INTO user_settings (
      id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
    ) VALUES ('settings-export-ready', 'user-123', 'lbs', 'UTC', 'complete',
              '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `
})

describe('DataExportService', () => {
  describe('exportData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('exports empty data when user has no records', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.strictEqual(result.version, '3.0.0-alpha.2')
          assert.lengthOf(result.data.weightLogs, 0)
          assert.lengthOf(result.data.injectionLogs, 0)
          assert.lengthOf(result.data.schedules, 0)
          assert.lengthOf(result.data.goals, 0)
          assert.strictEqual(result.data.settings?.timezone, 'UTC')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects the previous v2 export contract explicitly', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          const service = yield* DataExportService
          const snapshot = yield* service.exportData('user-123')
          const encoded = yield* Schema.encodeEffect(DataExport)(snapshot)

          const result = Schema.decodeUnknownExit(DataExport)({ ...encoded, version: '2.0.0' })

          assert.isTrue(Exit.isFailure(result))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports weight logs for user', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          // Insert data for user-123
          yield* insertWeightLog({ id: 'wl-1', datetime: testDate('2024-01-01'), weight: 200, userId: 'user-123' })
          yield* insertWeightLog({ id: 'wl-2', datetime: testDate('2024-01-02'), weight: 199, userId: 'user-123' })
          // Insert data for different user (should not be exported)
          yield* insertWeightLog({ id: 'wl-3', datetime: testDate('2024-01-03'), weight: 180, userId: 'user-456' })

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.lengthOf(result.data.weightLogs, 2)
          assert.include(
            Arr.map(result.data.weightLogs, (w): string => w.id),
            'wl-1'
          )
          assert.include(
            Arr.map(result.data.weightLogs, (w): string => w.id),
            'wl-2'
          )
          assert.notInclude(
            Arr.map(result.data.weightLogs, (w): string => w.id),
            'wl-3'
          )
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports only the requested user goals', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          const sql = yield* SqlClient.SqlClient
          const createdAt = '2024-01-01T00:00:00.000Z'
          yield* sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at)
            VALUES ('goal-owned', 'user-123', 170, 200, '2024-01-01', NULL, 1, NULL, 1, NULL, ${createdAt}, ${createdAt})
          `
          yield* sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at)
            VALUES ('goal-other', 'user-456', 150, 180, '2024-01-01', NULL, 1, NULL, 1, NULL, ${createdAt}, ${createdAt})
          `

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.deepStrictEqual(
            Arr.map(result.data.goals, (goal) => goal.id),
            ['goal-owned']
          )
        })
      )

      it.effect('uses the Effect clock for the export timestamp', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          const now = testDate('2024-06-15T12:34:56Z')
          yield* TestClock.setTime(now.getTime())

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.strictEqual(DateTime.toEpochMillis(result.exportedAt), now.getTime())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('refuses to promote a pending positive-offset goal into a v3 export', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T00:00:00.000Z'
          yield* sql`
            INSERT INTO user_settings (
              id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
            ) VALUES ('settings-pending-export', 'user-pending-export', 'lbs', 'Pacific/Auckland', 'pending', ${audit}, ${audit})
          `
          yield* sql`
            INSERT INTO user_goals (
              id, user_id, goal_weight, starting_weight, starting_date, target_date,
              calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
            ) VALUES ('goal-pending-export', 'user-pending-export', 170, 200, '2026-01-01', NULL,
                      0, NULL, 1, NULL, ${audit}, ${audit})
          `

          const service = yield* DataExportService
          const result = yield* service.exportData('user-pending-export').pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')

          if (result._tag === 'Failure') {
            assert.instanceOf(result.failure, DataExportTemporalMigrationRequired)
            assert.strictEqual(result.failure.pendingGoals, 1)
            assert.include(result.failure.message, 'Complete timezone setup')
          }

          const rows = yield* sql`
            SELECT starting_date, calendar_date_migrated
            FROM user_goals WHERE id = 'goal-pending-export'
          `

          const persisted = yield* Schema.decodeUnknownEffect(
            Schema.Array(
              Schema.Struct({
                calendar_date_migrated: Schema.Int,
                starting_date: Schema.String,
              })
            )
          )(rows)

          assert.deepStrictEqual(persisted, [{ calendar_date_migrated: 0, starting_date: '2026-01-01' }])
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports user settings', () =>
        Effect.gen(function* () {
          yield* insertSettings({ id: 's-1', userId: 'user-123', weightUnit: 'kg', timezone: 'America/New_York' })

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.isNotNull(result.data.settings)
          assert.strictEqual(result.data.settings?.weightUnit, 'kg')
          assert.strictEqual(result.data.settings?.timezone, 'America/New_York')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('round-trips canonical medication and temporal fields through the alpha.2 contract', () =>
        Effect.gen(function* () {
          yield* ensureExportReady
          yield* insertSchedule({
            id: 'schedule-1',
            name: 'Titration',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2026-01-01T00:00:00Z'),
            userId: 'user-123',
            supplier: 'Clinic',
          })
          yield* insertSchedulePhase({
            id: 'phase-1',
            scheduleId: 'schedule-1',
            order: 1,
            doseMg: 0.25,
            durationDays: null,
          })
          yield* insertInjectionLog({
            id: 'injection-1',
            datetime: testDate('2026-01-08T12:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 0.25,
            userId: 'user-123',
            scheduleId: 'schedule-1',
            supplier: 'Pharmacy',
          })

          const service = yield* DataExportService
          const snapshot = yield* service.exportData('user-123')

          assert.strictEqual(snapshot.version, '3.0.0-alpha.2')
          assert.strictEqual(snapshot.data.schedules[0]?.drug, 'Semaglutide')
          assert.strictEqual(snapshot.data.schedules[0]?.supplier, 'Clinic')
          assert.strictEqual(snapshot.data.schedules[0]?.startDate, '2026-01-01')
          assert.strictEqual(snapshot.data.schedules[0]?.phases[0]?.doseMg, 0.25)
          assert.strictEqual(snapshot.data.injectionLogs[0]?.drug, 'Semaglutide')
          assert.strictEqual(snapshot.data.injectionLogs[0]?.supplier, 'Pharmacy')
          assert.strictEqual(snapshot.data.injectionLogs[0]?.doseMg, 0.25)
          assert.strictEqual(snapshot.data.settings?.timezone, 'UTC')
          const encodedSnapshot = yield* Schema.encodeEffect(Schema.fromJsonString(DataExport))(snapshot)
          assert.notInclude(encodedSnapshot, '"source"')
          assert.notInclude(encodedSnapshot, '"dosage"')

          yield* service.importData('user-123', snapshot)
          const roundTripped = yield* service.exportData('user-123')

          assert.strictEqual(roundTripped.data.schedules[0]?.supplier, 'Clinic')
          assert.strictEqual(roundTripped.data.schedules[0]?.phases[0]?.doseMg, 0.25)
          assert.strictEqual(roundTripped.data.injectionLogs[0]?.supplier, 'Pharmacy')
          assert.strictEqual(roundTripped.data.injectionLogs[0]?.doseMg, 0.25)
        })
      )
    })
  })
})
