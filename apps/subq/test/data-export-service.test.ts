import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { TestClock } from 'effect/testing'
import { SqlClient } from 'effect/unstable/sql'

import {
  DataExport,
  DataExportTemporalMigrationRequired,
  DoseMg,
  MedicationCompound,
  ExportedSettings,
  InjectionLog,
  InjectionLogId,
  InjectionScheduleId,
  IanaTimezone,
  Notes,
  Weight,
  WeightLog,
  WeightLogId,
} from '#shared'

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
          yield* insertWeightLog('wl-1', testDate('2024-01-01'), 200, 'user-123')
          yield* insertWeightLog('wl-2', testDate('2024-01-02'), 199, 'user-123')
          // Insert data for different user (should not be exported)
          yield* insertWeightLog('wl-3', testDate('2024-01-03'), 180, 'user-456')

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.lengthOf(result.data.weightLogs, 2)
          assert.include(
            result.data.weightLogs.map((w): string => w.id),
            'wl-1'
          )
          assert.include(
            result.data.weightLogs.map((w): string => w.id),
            'wl-2'
          )
          assert.notInclude(
            result.data.weightLogs.map((w): string => w.id),
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
            result.data.goals.map((goal) => goal.id),
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
                calendar_date_migrated: Schema.Number,
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
          yield* insertSettings('s-1', 'user-123', 'kg', 'America/New_York')

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
          yield* insertSchedule(
            'schedule-1',
            'Titration',
            'Semaglutide',
            'weekly',
            testDate('2026-01-01T00:00:00Z'),
            'user-123',
            { supplier: 'Clinic' }
          )
          yield* insertSchedulePhase('phase-1', 'schedule-1', 1, 0.25, null)
          yield* insertInjectionLog('injection-1', testDate('2026-01-08T12:00:00Z'), 'Semaglutide', 0.25, 'user-123', {
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

  describe('importData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('round-trips planned calendar dates without changing event instants', () =>
        Effect.gen(function* () {
          const userId = 'user-temporal-roundtrip'
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T12:34:56.000Z'
          yield* insertSettings('settings-temporal', userId, 'lbs', 'Pacific/Auckland')
          yield* insertWeightLog('weight-temporal', testDate('2026-01-15T23:45:00Z'), 190, userId)
          yield* sql`
            INSERT INTO injection_schedules (
              id, name, drug, frequency, start_date, calendar_date_migrated,
              is_active, user_id, created_at, updated_at
            ) VALUES ('schedule-temporal', 'Weekly', 'Semaglutide', 'weekly', '2026-01-16', 1,
                      1, ${userId}, ${audit}, ${audit})
          `
          yield* sql`
            INSERT INTO user_goals (
              id, user_id, goal_weight, starting_weight, starting_date, target_date,
              calendar_date_migrated, is_active, completed_at, created_at, updated_at
            ) VALUES ('goal-temporal', ${userId}, 170, 200, '2026-01-16', '2026-06-30',
                      1, 0, '2026-05-01T22:10:00.000Z', ${audit}, ${audit})
          `

          const service = yield* DataExportService
          const snapshot = yield* service.exportData(userId)
          yield* service.importData(userId, snapshot)
          const restored = yield* service.exportData(userId)
          const markerRows = yield* sql`
            SELECT
              (SELECT calendar_date_migrated FROM injection_schedules WHERE id = 'schedule-temporal') AS schedule_migrated,
              (SELECT calendar_date_migrated FROM user_goals WHERE id = 'goal-temporal') AS goal_migrated
          `
          const markers = yield* Schema.decodeUnknownEffect(
            Schema.Array(
              Schema.Struct({
                goal_migrated: Schema.Number,
                schedule_migrated: Schema.Number,
              })
            )
          )(markerRows)

          const [restoredGoal] = restored.data.goals
          const [restoredWeight] = restored.data.weightLogs
          assert.isDefined(restoredGoal)
          assert.isDefined(restoredWeight)
          if (restoredGoal === undefined || restoredWeight === undefined) {
            return
          }
          assert.strictEqual(restored.data.schedules[0]?.startDate, '2026-01-16')
          assert.strictEqual(restoredGoal.startingDate, '2026-01-16')
          assert.strictEqual(restoredGoal.targetDate, '2026-06-30')
          assert.strictEqual(
            restoredGoal.completedAt === null ? null : DateTime.formatIso(restoredGoal.completedAt),
            '2026-05-01T22:10:00.000Z'
          )
          assert.strictEqual(DateTime.formatIso(restoredWeight.datetime), '2026-01-15T23:45:00.000Z')
          assert.strictEqual(restored.data.settings?.timezone, 'Pacific/Auckland')
          assert.deepStrictEqual(markers, [{ goal_migrated: 1, schedule_migrated: 1 }])
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('imports data and clears existing', () =>
        Effect.gen(function* () {
          // Insert existing data that should be deleted
          yield* insertWeightLog('existing-1', testDate('2024-01-01'), 200, 'user-123')
          yield* insertSettings('s-existing', 'user-123', 'lbs', 'America/New_York')

          const service = yield* DataExportService

          // Create import data
          const importData = new DataExport({
            version: '3.0.0-alpha.2',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                new WeightLog({
                  id: WeightLogId.make('imported-1'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: Notes.make('imported log'),
                  createdAt: DateTime.nowUnsafe(),
                  updatedAt: DateTime.nowUnsafe(),
                }),
              ],
              injectionLogs: [],
              schedules: [],
              goals: [],
              settings: new ExportedSettings({
                timezone: IanaTimezone.make('Pacific/Auckland'),
                weightUnit: 'kg',
              }),
            },
          })

          const result = yield* service.importData('user-123', importData)

          assert.strictEqual(result.weightLogs, 1)
          assert.isTrue(result.settingsUpdated)

          // Verify old data is gone and new data is present
          const exported = yield* service.exportData('user-123')
          assert.lengthOf(exported.data.weightLogs, 1)
          const [exportedWeightLog] = exported.data.weightLogs
          assert.isDefined(exportedWeightLog)
          if (exportedWeightLog === undefined) {
            return
          }
          assert.strictEqual(exportedWeightLog.id, 'imported-1')
          assert.strictEqual(exported.data.settings?.weightUnit, 'kg')
          assert.strictEqual(exported.data.settings?.timezone, 'Pacific/Auckland')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('preserves other user data during import', () =>
        Effect.gen(function* () {
          // Insert data for different user
          yield* insertWeightLog('other-user-1', testDate('2024-01-01'), 180, 'user-456')
          yield* insertSettings('settings-other-user', 'user-456', 'lbs', 'UTC')

          const service = yield* DataExportService

          // Import data for user-123
          const importData = new DataExport({
            version: '3.0.0-alpha.2',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                new WeightLog({
                  id: WeightLogId.make('user123-log'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: DateTime.nowUnsafe(),
                  updatedAt: DateTime.nowUnsafe(),
                }),
              ],
              injectionLogs: [],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          yield* service.importData('user-123', importData)

          // Verify other user's data is preserved
          const otherUserExport = yield* service.exportData('user-456')
          assert.lengthOf(otherUserExport.data.weightLogs, 1)
          const [otherUserWeightLog] = otherUserExport.data.weightLogs
          assert.isDefined(otherUserWeightLog)
          if (otherUserWeightLog === undefined) {
            return
          }
          assert.strictEqual(otherUserWeightLog.id, 'other-user-1')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      // No transactional rollback: the production D1 driver has no
      // transactions, so a failed import leaves partial state. The import
      // deletes the user's rows first, so re-running a corrected import
      // fully recovers.
      it.effect('leaves recoverable partial state when an import row fails', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('existing-1', testDate('2024-01-01'), 200, 'user-123')

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const duplicateId = WeightLogId.make('duplicate-log')
          const importData = new DataExport({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [
                new WeightLog({
                  id: duplicateId,
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
                new WeightLog({
                  id: duplicateId,
                  datetime: DateTime.makeUnsafe('2024-02-02T00:00:00Z'),
                  weight: Weight.make(191),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              ],
              injectionLogs: [],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          const result = yield* service.importData('user-123', importData).pipe(Effect.result)
          assert.strictEqual(result._tag, 'Failure')

          // Old data was replaced; the first row of the failed import remains,
          // but it cannot be exported until settings initialization completes.
          const sql = yield* SqlClient.SqlClient
          const partialRows = yield* sql`SELECT id FROM weight_logs WHERE user_id = 'user-123' ORDER BY id`
          const partial = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ id: Schema.String })))(
            partialRows
          )
          assert.deepStrictEqual(partial, [{ id: 'duplicate-log' }])

          // Re-running with a corrected import fully recovers.
          const corrected = new DataExport({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [
                new WeightLog({
                  id: WeightLogId.make('corrected-log'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              ],
              injectionLogs: [],
              schedules: [],
              goals: [],
              settings: new ExportedSettings({ timezone: IanaTimezone.make('UTC'), weightUnit: 'lbs' }),
            },
          })
          yield* service.importData('user-123', corrected)
          const recovered = yield* service.exportData('user-123')
          assert.deepStrictEqual(
            recovered.data.weightLogs.map((log) => log.id),
            ['corrected-log']
          )
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects injection logs that reference schedules missing from the import', () =>
        Effect.gen(function* () {
          yield* insertWeightLog('existing-1', testDate('2024-01-01'), 200, 'user-123')
          yield* ensureExportReady

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const importData = new DataExport({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [],
              injectionLogs: [
                new InjectionLog({
                  id: InjectionLogId.make('inj-1'),
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  drug: MedicationCompound.make('Semaglutide'),
                  supplier: null,
                  doseMg: DoseMg.make(100),
                  injectionSite: null,
                  notes: null,
                  scheduleId: InjectionScheduleId.make('missing-schedule'),
                  createdAt: now,
                  updatedAt: now,
                }),
              ],
              schedules: [],
              goals: [],
              settings: null,
            },
          })

          const result = yield* service.importData('user-123', importData).pipe(Effect.result)
          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.include(result.failure.message, 'references missing schedule')
          }

          const exported = yield* service.exportData('user-123')
          assert.deepStrictEqual(
            exported.data.weightLogs.map((log) => log.id),
            ['existing-1']
          )
        })
      )
    })
  })
})
