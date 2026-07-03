import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { SqlClient } from 'effect/unstable/sql'

import type { DataImportResult } from '#shared'
import {
  DataExport,
  DataExportError,
  DataImportError,
  Dosage,
  DrugName,
  DrugSource,
  ExportedSettings,
  Frequency,
  GoalId,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  InjectionSite,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  UserGoal,
  Weight,
  WeightLog,
  WeightLogId,
} from '#shared'

import { randomUuid } from '../shared/common/random-uuid.js'
import { planDataImport } from './data-import-plan.js'
import type { DataImportPlan } from './data-import-plan.js'

// ============================================
// Service Definition
// ============================================

export class DataExportService extends Context.Service<
  DataExportService,
  {
    readonly exportData: (userId: string) => Effect.Effect<DataExport, DataExportError>
    readonly importData: (userId: string, data: DataExport) => Effect.Effect<DataImportResult, DataImportError>
  }
>()('@garage/subq/data-export/data-export-service/DataExportService') {}

// ============================================
// Row Schemas for Direct SQL Queries
// ============================================

const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  weight: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  schedule_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const ScheduleRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  frequency: Frequency,
  start_date: Schema.String,
  is_active: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const PhaseRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.String,
  order: PhaseOrder,
  duration_days: Schema.NullOr(PhaseDurationDays),
  dosage: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
})

const GoalRow = Schema.Struct({
  id: Schema.String,
  goal_weight: Schema.Number,
  starting_weight: Schema.Number,
  starting_date: Schema.String,
  target_date: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  is_active: Schema.Number,
  completed_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const SettingsRow = Schema.Struct({
  weight_unit: Schema.Literals(['lbs', 'kg'] as const),
})

// ============================================
// Implementation
// ============================================

export const DataExportServiceLive = Layer.effect(
  DataExportService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const decodeSchedule = Effect.fn('DataExportService.decodeSchedule')(function* (row: unknown) {
      const r = yield* Schema.decodeUnknownEffect(ScheduleRow)(row)

      // Fetch phases for this schedule
      const phaseRows = yield* sql`
        SELECT id, schedule_id, "order", duration_days, dosage, created_at, updated_at
        FROM schedule_phases WHERE schedule_id = ${r.id}
        ORDER BY "order" ASC
      `
      const phases = yield* Effect.forEach(
        phaseRows,
        (pr) =>
          Schema.decodeUnknownEffect(PhaseRow)(pr).pipe(
            Effect.map(
              (p) =>
                new SchedulePhase({
                  id: SchedulePhaseId.make(p.id),
                  scheduleId: InjectionScheduleId.make(p.schedule_id),
                  order: p.order,
                  durationDays: p.duration_days,
                  dosage: Dosage.make(p.dosage),
                  createdAt: DateTime.makeUnsafe(p.created_at),
                  updatedAt: DateTime.makeUnsafe(p.updated_at),
                })
            )
          ),
        { concurrency: 1 }
      )

      return new InjectionSchedule({
        id: InjectionScheduleId.make(r.id),
        name: ScheduleName.make(r.name),
        drug: DrugName.make(r.drug),
        source: r.source !== null && Str.isNonEmpty(r.source) ? DrugSource.make(r.source) : null,
        frequency: r.frequency,
        startDate: DateTime.makeUnsafe(r.start_date),
        isActive: r.is_active === 1,
        notes: r.notes !== null && Str.isNonEmpty(r.notes) ? Notes.make(r.notes) : null,
        phases,
        createdAt: DateTime.makeUnsafe(r.created_at),
        updatedAt: DateTime.makeUnsafe(r.updated_at),
      })
    })

    const exportData = Effect.fn('DataExportService.exportData')(
      function* (userId: string) {
        // Fetch all weight logs
        const weightLogRows = yield* sql`
          SELECT id, datetime, weight, notes, created_at, updated_at
          FROM weight_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const weightLogs = yield* Effect.forEach(
          weightLogRows,
          (row) =>
            Schema.decodeUnknownEffect(WeightLogRow)(row).pipe(
              Effect.map(
                (r) =>
                  new WeightLog({
                    id: WeightLogId.make(r.id),
                    datetime: DateTime.makeUnsafe(r.datetime),
                    weight: Weight.make(r.weight),
                    notes: r.notes !== null && Str.isNonEmpty(r.notes) ? Notes.make(r.notes) : null,
                    createdAt: DateTime.makeUnsafe(r.created_at),
                    updatedAt: DateTime.makeUnsafe(r.updated_at),
                  })
              )
            ),
          { concurrency: 1 }
        )

        // Fetch all injection logs
        const injectionLogRows = yield* sql`
          SELECT id, datetime, drug, source, dosage, injection_site, notes, schedule_id, created_at, updated_at
          FROM injection_logs WHERE user_id = ${userId}
          ORDER BY datetime DESC
        `
        const injectionLogs = yield* Effect.forEach(
          injectionLogRows,
          (row) =>
            Schema.decodeUnknownEffect(InjectionLogRow)(row).pipe(
              Effect.map(
                (r) =>
                  new InjectionLog({
                    id: InjectionLogId.make(r.id),
                    datetime: DateTime.makeUnsafe(r.datetime),
                    drug: DrugName.make(r.drug),
                    source: r.source !== null && Str.isNonEmpty(r.source) ? DrugSource.make(r.source) : null,
                    dosage: Dosage.make(r.dosage),
                    injectionSite:
                      r.injection_site !== null && Str.isNonEmpty(r.injection_site)
                        ? InjectionSite.make(r.injection_site)
                        : null,
                    notes: r.notes !== null && Str.isNonEmpty(r.notes) ? Notes.make(r.notes) : null,
                    scheduleId:
                      r.schedule_id !== null && Str.isNonEmpty(r.schedule_id)
                        ? InjectionScheduleId.make(r.schedule_id)
                        : null,
                    createdAt: DateTime.makeUnsafe(r.created_at),
                    updatedAt: DateTime.makeUnsafe(r.updated_at),
                  })
              )
            ),
          { concurrency: 1 }
        )

        // Fetch all schedules with phases
        const scheduleRows = yield* sql`
          SELECT id, name, drug, source, frequency, start_date, is_active, notes, created_at, updated_at
          FROM injection_schedules WHERE user_id = ${userId}
          ORDER BY start_date DESC
        `
        const schedules = yield* Effect.forEach(scheduleRows, (row) => decodeSchedule(row), { concurrency: 1 })

        // Fetch all goals
        const goalRows = yield* sql`
          SELECT id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const goals = yield* Effect.forEach(
          goalRows,
          (row) =>
            Schema.decodeUnknownEffect(GoalRow)(row).pipe(
              Effect.map(
                (r) =>
                  new UserGoal({
                    id: GoalId.make(r.id),
                    goalWeight: Weight.make(r.goal_weight),
                    startingWeight: Weight.make(r.starting_weight),
                    startingDate: DateTime.makeUnsafe(r.starting_date),
                    targetDate:
                      r.target_date !== null && Str.isNonEmpty(r.target_date)
                        ? DateTime.makeUnsafe(r.target_date)
                        : null,
                    notes: r.notes !== null && Str.isNonEmpty(r.notes) ? Notes.make(r.notes) : null,
                    isActive: r.is_active === 1,
                    completedAt:
                      r.completed_at !== null && Str.isNonEmpty(r.completed_at)
                        ? DateTime.makeUnsafe(r.completed_at)
                        : null,
                    createdAt: DateTime.makeUnsafe(r.created_at),
                    updatedAt: DateTime.makeUnsafe(r.updated_at),
                  })
              )
            ),
          { concurrency: 1 }
        )

        // Fetch settings
        const settingsRows = yield* sql`
          SELECT weight_unit FROM user_settings WHERE user_id = ${userId}
        `
        const settings = Arr.isReadonlyArrayNonEmpty(settingsRows)
          ? yield* Schema.decodeUnknownEffect(SettingsRow)(Arr.headNonEmpty(settingsRows)).pipe(
              Effect.map((r) => new ExportedSettings({ weightUnit: r.weight_unit }))
            )
          : null

        return new DataExport({
          version: '2.0.0',
          exportedAt: DateTime.nowUnsafe(),
          data: {
            weightLogs,
            injectionLogs,
            schedules,
            goals,
            settings,
          },
        })
      },
      Effect.mapError((cause) => DataExportError.make({ message: 'Failed to export data', cause }))
    )

    // Insert one schedule and its phases sequentially so phases follow their parent.
    const importSchedule = Effect.fn('DataExportService.importSchedule')(function* (
      userId: string,
      schedule: InjectionSchedule
    ) {
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
        VALUES (${schedule.id}, ${schedule.name}, ${schedule.drug}, ${schedule.source}, ${schedule.frequency}, ${DateTime.formatIso(schedule.startDate)}, ${schedule.isActive ? 1 : 0}, ${schedule.notes}, ${userId}, ${DateTime.formatIso(schedule.createdAt)}, ${DateTime.formatIso(schedule.updatedAt)})
      `

      yield* Effect.forEach(
        schedule.phases,
        (phase) =>
          sql`
            INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
            VALUES (${phase.id}, ${phase.scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${DateTime.formatIso(phase.createdAt)}, ${DateTime.formatIso(phase.updatedAt)})
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
            INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
            VALUES (${log.id}, ${DateTime.formatIso(log.datetime)}, ${log.drug}, ${log.source}, ${log.dosage}, ${log.injectionSite}, ${log.notes}, ${log.scheduleId}, ${userId}, ${DateTime.formatIso(log.createdAt)}, ${DateTime.formatIso(log.updatedAt)})
          `,
        { concurrency: 1 }
      )

      // Import goals
      yield* Effect.forEach(
        snapshot.data.goals,
        (goal) => {
          const targetDate = goal.targetDate !== null ? DateTime.formatIso(goal.targetDate) : null
          const completedAt = goal.completedAt !== null ? DateTime.formatIso(goal.completedAt) : null
          return sql`
            INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
            VALUES (${goal.id}, ${userId}, ${goal.goalWeight}, ${goal.startingWeight}, ${DateTime.formatIso(goal.startingDate).split('T')[0]}, ${targetDate}, ${goal.notes}, ${goal.isActive ? 1 : 0}, ${completedAt}, ${DateTime.formatIso(goal.createdAt)}, ${DateTime.formatIso(goal.updatedAt)})
          `
        },
        { concurrency: 1 }
      )

      // Import settings
      if (snapshot.data.settings !== null) {
        const id = yield* randomUuid()
        const now = DateTime.formatIso(yield* DateTime.now)
        yield* sql`
          INSERT INTO user_settings (id, user_id, weight_unit, created_at, updated_at)
          VALUES (${id}, ${userId}, ${snapshot.data.settings.weightUnit}, ${now}, ${now})
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
