import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'
import type { SqlConnection } from 'effect/unstable/sql'

import type { DataImportResult, InjectionSchedule } from '#shared'
import {
  DataExport,
  DataExportError,
  DataExportTemporalMigrationRequired,
  DataImportError,
  ExportedSettings,
  IanaTimezone,
} from '#shared'

import { goalRowToDomain, GoalRow } from '../goals/goal-repo.js'
import { InjectionLogRow, rowToDomain as injectionLogRowToDomain } from '../injection/injection-log-repo.js'
import { phaseRowToDomain, PhaseRow, scheduleRowToDomain, ScheduleRow } from '../schedule/schedule-repo.js'
import { randomUuid } from '../shared/common/random-uuid.js'
import { rowToDomain as weightLogRowToDomain, WeightLogRow } from '../weight/weight-log-repo.js'
import { planDataImport } from './data-import-plan.js'
import type { DataImportPlan } from './data-import-plan.js'

// ============================================
// Service Definition
// ============================================

export class DataExportService extends Context.Service<
  DataExportService,
  {
    readonly exportData: (
      userId: string
    ) => Effect.Effect<DataExport, DataExportError | DataExportTemporalMigrationRequired>
    readonly importData: (userId: string, data: DataExport) => Effect.Effect<DataImportResult, DataImportError>
  }
>()('@garage/subq/data-export/data-export-service/DataExportService') {}

// ============================================
// Row Schemas for Direct SQL Queries
// ============================================

const SettingsRow = Schema.Struct({
  weight_unit: Schema.Literals(['lbs', 'kg'] as const),
  timezone: IanaTimezone,
})

const ExportTemporalStateRow = Schema.Struct({
  migration_state: Schema.NullOr(Schema.String),
  timezone: Schema.NullOr(IanaTimezone),
  pending_goals: Schema.Number,
  pending_schedules: Schema.Number,
})

// ============================================
// Implementation
// ============================================

export const DataExportServiceLive = Layer.effect(
  DataExportService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const decodeSchedule = Effect.fn('DataExportService.decodeSchedule')(function* (row: SqlConnection.Row) {
      const r = yield* Schema.decodeUnknownEffect(ScheduleRow)(row)

      // Fetch phases for this schedule
      const phaseRows = yield* sql`
        SELECT id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at
        FROM schedule_phases WHERE schedule_id = ${r.id}
        ORDER BY "order" ASC
      `
      const decodedPhaseRows = yield* Schema.decodeUnknownEffect(Schema.Array(PhaseRow))(phaseRows)
      const phases = Arr.map(decodedPhaseRows, phaseRowToDomain)

      return scheduleRowToDomain(r, phases)
    })

    const exportData = Effect.fn('DataExportService.exportData')(
      function* (userId: string) {
        const stateRows = yield* sql`
          SELECT
            (SELECT timezone_migration_state FROM user_settings WHERE user_id = ${userId}) AS migration_state,
            (SELECT timezone FROM user_settings WHERE user_id = ${userId}) AS timezone,
            (SELECT COUNT(*) FROM user_goals WHERE user_id = ${userId} AND calendar_date_migrated = 0) AS pending_goals,
            (SELECT COUNT(*) FROM injection_schedules WHERE user_id = ${userId} AND calendar_date_migrated = 0) AS pending_schedules
        `
        const state = yield* Schema.decodeUnknownEffect(ExportTemporalStateRow)(stateRows[0])
        if (
          state.migration_state !== 'complete' ||
          state.timezone === null ||
          state.pending_goals > 0 ||
          state.pending_schedules > 0
        ) {
          return yield* new DataExportTemporalMigrationRequired({
            message:
              'Complete timezone setup and temporal migration before exporting. Correct any reported legacy date and retry timezone setup.',
            pendingGoals: state.pending_goals,
            pendingSchedules: state.pending_schedules,
            userId,
          })
        }

        // Fetch all weight logs
        const weightLogRows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const decodedWeightLogRows = yield* Schema.decodeUnknownEffect(Schema.Array(WeightLogRow))(weightLogRows)
        const weightLogs = Arr.map(decodedWeightLogRows, weightLogRowToDomain)

        // Fetch all injection logs
        const injectionLogRows = yield* sql`
          SELECT id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const decodedInjectionLogRows = yield* Schema.decodeUnknownEffect(Schema.Array(InjectionLogRow))(
          injectionLogRows
        )
        const injectionLogs = Arr.map(decodedInjectionLogRows, injectionLogRowToDomain)

        // Fetch all schedules with phases
        const scheduleRows = yield* sql`
          SELECT id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
                 is_active, notes, created_at, updated_at
          FROM injection_schedules WHERE user_id = ${userId}
          ORDER BY start_date DESC
        `
        const schedules = yield* Effect.forEach(scheduleRows, (row) => decodeSchedule(row), {
          concurrency: 1,
        })

        // Fetch all goals
        const goalRows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date, target_date,
                 calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const decodedGoalRows = yield* Schema.decodeUnknownEffect(Schema.Array(GoalRow))(goalRows)
        const goals = Arr.map(decodedGoalRows, goalRowToDomain)

        // Fetch settings
        const settingsRows = yield* sql`
          SELECT weight_unit, timezone FROM user_settings WHERE user_id = ${userId}
        `
        const settings = Arr.isReadonlyArrayNonEmpty(settingsRows)
          ? yield* Schema.decodeUnknownEffect(SettingsRow)(Arr.headNonEmpty(settingsRows)).pipe(
              Effect.map((r) => new ExportedSettings({ timezone: r.timezone, weightUnit: r.weight_unit }))
            )
          : null

        const exportedAt = yield* DateTime.now
        return new DataExport({
          version: '3.0.0-alpha.2',
          exportedAt,
          data: {
            weightLogs,
            injectionLogs,
            schedules,
            goals,
            settings,
          },
        })
      },
      Effect.mapError((cause) =>
        Schema.is(DataExportTemporalMigrationRequired)(cause)
          ? cause
          : DataExportError.make({ message: 'Failed to export data', cause })
      )
    )

    // Insert one schedule and its phases sequentially so phases follow their parent.
    const importSchedule = Effect.fn('DataExportService.importSchedule')(function* (
      userId: string,
      schedule: InjectionSchedule
    ) {
      yield* sql`
        INSERT INTO injection_schedules (
          id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
          is_active, notes, user_id, created_at, updated_at
        )
        VALUES (${schedule.id}, ${schedule.name}, ${schedule.drug}, ${schedule.supplier}, ${schedule.frequency}, ${schedule.startDate}, 1, ${schedule.isActive ? 1 : 0}, ${schedule.notes}, ${userId}, ${DateTime.formatIso(schedule.createdAt)}, ${DateTime.formatIso(schedule.updatedAt)})
      `

      yield* Effect.forEach(
        schedule.phases,
        (phase) =>
          sql`
            INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at)
            VALUES (${phase.id}, ${phase.scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.doseMg}, ${DateTime.formatIso(phase.createdAt)}, ${DateTime.formatIso(phase.updatedAt)})
          `,
        { concurrency: 1 }
      )
    })

    const applyDataImport = Effect.fn('DataExportService.applyDataImport')(function* (
      userId: string,
      plan: DataImportPlan
    ) {
      const { snapshot } = plan

      // Delete all existing user data (in order to handle foreign key constraints)
      yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
      yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`
      yield* sql`DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${userId})`
      yield* sql`DELETE FROM injection_schedules WHERE user_id = ${userId}`
      yield* sql`DELETE FROM user_goals WHERE user_id = ${userId}`
      yield* sql`DELETE FROM user_settings WHERE user_id = ${userId}`

      // Import weight logs in order (a failed row leaves earlier rows persisted)
      yield* Effect.forEach(
        snapshot.data.weightLogs,
        (log) =>
          sql`
            INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
            VALUES (${log.id}, ${DateTime.formatIso(log.datetime)}, ${log.weight}, ${log.notes}, ${userId}, ${DateTime.formatIso(log.createdAt)}, ${DateTime.formatIso(log.updatedAt)})
          `,
        { concurrency: 1 }
      )

      // Import schedules first (so injection logs can reference them)
      yield* Effect.forEach(snapshot.data.schedules, (schedule) => importSchedule(userId, schedule), {
        concurrency: 1,
      })

      // Import injection logs
      yield* Effect.forEach(
        snapshot.data.injectionLogs,
        (log) =>
          sql`
            INSERT INTO injection_logs (id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, user_id, created_at, updated_at)
            VALUES (${log.id}, ${DateTime.formatIso(log.datetime)}, ${log.drug}, ${log.supplier}, ${log.doseMg}, ${log.injectionSite}, ${log.notes}, ${log.scheduleId}, ${userId}, ${DateTime.formatIso(log.createdAt)}, ${DateTime.formatIso(log.updatedAt)})
          `,
        { concurrency: 1 }
      )

      // Import goals
      yield* Effect.forEach(
        snapshot.data.goals,
        (goal) => {
          const completedAt = goal.completedAt !== null ? DateTime.formatIso(goal.completedAt) : null
          return sql`
            INSERT INTO user_goals (
              id, user_id, goal_weight, starting_weight, starting_date, target_date,
              calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
            )
            VALUES (${goal.id}, ${userId}, ${goal.goalWeight}, ${goal.startingWeight}, ${goal.startingDate}, ${goal.targetDate}, 1, ${goal.notes}, ${goal.isActive ? 1 : 0}, ${completedAt}, ${DateTime.formatIso(goal.createdAt)}, ${DateTime.formatIso(goal.updatedAt)})
          `
        },
        { concurrency: 1 }
      )

      // Import settings
      if (snapshot.data.settings !== null) {
        const id = yield* randomUuid()
        const now = DateTime.formatIso(yield* DateTime.now)
        yield* sql`
          INSERT INTO user_settings (id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at)
          VALUES (${id}, ${userId}, ${snapshot.data.settings.weightUnit}, ${snapshot.data.settings.timezone}, 'complete', ${now}, ${now})
        `
      }
    })

    const importData = Effect.fn('DataExportService.importData')(function* (userId: string, data: DataExport) {
      const plan = yield* planDataImport(data)
      // No transaction: the D1 driver does not support them (withTransaction
      // dies at runtime). A failed import can leave partial data; the import
      // flow starts by deleting the user's rows, so re-running it recovers.
      yield* applyDataImport(userId, plan).pipe(
        Effect.mapError((cause) => DataImportError.make({ message: 'Failed to import data', cause }))
      )
      return plan.result
    })

    return { exportData, importData }
  })
)
