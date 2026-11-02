import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'

import {
  DataExport,
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
import { insertSettings, insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

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
  describe('importData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('round-trips planned calendar dates without changing event instants', () =>
        Effect.gen(function* () {
          const userId = 'user-temporal-roundtrip'
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T12:34:56.000Z'
          yield* insertSettings({ id: 'settings-temporal', userId, weightUnit: 'lbs', timezone: 'Pacific/Auckland' })
          yield* insertWeightLog({
            id: 'weight-temporal',
            datetime: testDate('2026-01-15T23:45:00Z'),
            weight: 190,
            userId,
          })
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
                goal_migrated: Schema.Int,
                schedule_migrated: Schema.Int,
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
          yield* insertWeightLog({
            id: 'existing-1',
            datetime: testDate('2024-01-01'),
            weight: 200,
            userId: 'user-123',
          })
          yield* insertSettings({
            id: 's-existing',
            userId: 'user-123',
            weightUnit: 'lbs',
            timezone: 'America/New_York',
          })

          const service = yield* DataExportService

          // Create import data
          const importData = DataExport.make({
            version: '3.0.0-alpha.2',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                WeightLog.make({
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
              settings: ExportedSettings.make({
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
          yield* insertWeightLog({
            id: 'other-user-1',
            datetime: testDate('2024-01-01'),
            weight: 180,
            userId: 'user-456',
          })
          yield* insertSettings({ id: 'settings-other-user', userId: 'user-456', weightUnit: 'lbs', timezone: 'UTC' })

          const service = yield* DataExportService

          // Import data for user-123
          const importData = DataExport.make({
            version: '3.0.0-alpha.2',
            exportedAt: DateTime.nowUnsafe(),
            data: {
              weightLogs: [
                WeightLog.make({
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
          yield* insertWeightLog({
            id: 'existing-1',
            datetime: testDate('2024-01-01'),
            weight: 200,
            userId: 'user-123',
          })

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const duplicateId = WeightLogId.make('duplicate-log')

          const importData = DataExport.make({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [
                WeightLog.make({
                  id: duplicateId,
                  datetime: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
                  weight: Weight.make(190),
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                }),
                WeightLog.make({
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
          const corrected = DataExport.make({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [
                WeightLog.make({
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
              settings: ExportedSettings.make({ timezone: IanaTimezone.make('UTC'), weightUnit: 'lbs' }),
            },
          })

          yield* service.importData('user-123', corrected)
          const recovered = yield* service.exportData('user-123')
          assert.deepStrictEqual(
            Arr.map(recovered.data.weightLogs, (log) => log.id),
            ['corrected-log']
          )
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects injection logs that reference schedules missing from the import', () =>
        Effect.gen(function* () {
          yield* insertWeightLog({
            id: 'existing-1',
            datetime: testDate('2024-01-01'),
            weight: 200,
            userId: 'user-123',
          })
          yield* ensureExportReady

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()

          const importData = DataExport.make({
            version: '3.0.0-alpha.2',
            exportedAt: now,
            data: {
              weightLogs: [],
              injectionLogs: [
                InjectionLog.make({
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
            Arr.map(exported.data.weightLogs, (log) => log.id),
            ['existing-1']
          )
        })
      )
    })
  })
})
