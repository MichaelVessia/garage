import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { TestClock } from 'effect/testing'
import { SqlClient } from 'effect/unstable/sql'

import {
  DataExport,
  DoseMg,
  MedicationCompound,
  ExportedSettings,
  InjectionLog,
  InjectionLogId,
  InjectionScheduleId,
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

describe('DataExportService', () => {
  describe('exportData', () => {
    it.layer(TestLayer)((it) => {
      it.effect('exports empty data when user has no records', () =>
        Effect.gen(function* () {
          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.strictEqual(result.version, '3.0.0-alpha.1')
          assert.lengthOf(result.data.weightLogs, 0)
          assert.lengthOf(result.data.injectionLogs, 0)
          assert.lengthOf(result.data.schedules, 0)
          assert.lengthOf(result.data.goals, 0)
          assert.isNull(result.data.settings)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects the previous v2 export contract explicitly', () =>
        Effect.gen(function* () {
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
          const sql = yield* SqlClient.SqlClient
          const createdAt = '2024-01-01T00:00:00.000Z'
          yield* sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
            VALUES ('goal-owned', 'user-123', 170, 200, '2024-01-01T00:00:00.000Z', NULL, NULL, 1, NULL, ${createdAt}, ${createdAt})
          `
          yield* sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
            VALUES ('goal-other', 'user-456', 150, 180, '2024-01-01T00:00:00.000Z', NULL, NULL, 1, NULL, ${createdAt}, ${createdAt})
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
          const now = testDate('2024-06-15T12:34:56Z')
          yield* TestClock.setTime(now.getTime())

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.strictEqual(DateTime.toEpochMillis(result.exportedAt), now.getTime())
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('exports user settings', () =>
        Effect.gen(function* () {
          yield* insertSettings('s-1', 'user-123', 'kg')

          const service = yield* DataExportService
          const result = yield* service.exportData('user-123')

          assert.isNotNull(result.data.settings)
          assert.strictEqual(result.data.settings?.weightUnit, 'kg')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('round-trips canonical medication records through the alpha v3 contract', () =>
        Effect.gen(function* () {
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

          assert.strictEqual(snapshot.version, '3.0.0-alpha.1')
          assert.strictEqual(snapshot.data.schedules[0]?.drug, 'Semaglutide')
          assert.strictEqual(snapshot.data.schedules[0]?.supplier, 'Clinic')
          assert.strictEqual(snapshot.data.schedules[0]?.phases[0]?.doseMg, 0.25)
          assert.strictEqual(snapshot.data.injectionLogs[0]?.drug, 'Semaglutide')
          assert.strictEqual(snapshot.data.injectionLogs[0]?.supplier, 'Pharmacy')
          assert.strictEqual(snapshot.data.injectionLogs[0]?.doseMg, 0.25)

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
      it.effect('imports data and clears existing', () =>
        Effect.gen(function* () {
          // Insert existing data that should be deleted
          yield* insertWeightLog('existing-1', testDate('2024-01-01'), 200, 'user-123')
          yield* insertSettings('s-existing', 'user-123', 'lbs')

          const service = yield* DataExportService

          // Create import data
          const importData = new DataExport({
            version: '3.0.0-alpha.1',
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
              settings: new ExportedSettings({ weightUnit: 'kg' }),
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
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('preserves other user data during import', () =>
        Effect.gen(function* () {
          // Insert data for different user
          yield* insertWeightLog('other-user-1', testDate('2024-01-01'), 180, 'user-456')

          const service = yield* DataExportService

          // Import data for user-123
          const importData = new DataExport({
            version: '3.0.0-alpha.1',
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
            version: '3.0.0-alpha.1',
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

          // Old data was replaced; the first row of the failed import remains.
          const exported = yield* service.exportData('user-123')
          assert.deepStrictEqual(
            exported.data.weightLogs.map((log) => log.id),
            ['duplicate-log']
          )

          // Re-running with a corrected import fully recovers.
          const corrected = new DataExport({
            version: '3.0.0-alpha.1',
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
              settings: null,
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

          const service = yield* DataExportService
          const now = DateTime.nowUnsafe()
          const importData = new DataExport({
            version: '3.0.0-alpha.1',
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
