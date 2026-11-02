import * as Schema from 'effect/Schema'

import { IanaTimezone } from '../calendar/domain.js'
import { UserGoal } from '../goals/domain.js'
import { InjectionLog } from '../injection/domain.js'
import { InjectionSchedule } from '../schedule/domain.js'
import { WeightLog } from '../weight/domain.js'

// ============================================
// Data Export Version
// ============================================

/**
 * Schema version for data exports.
 * Increment when making breaking changes to the export format.
 */
export const DataExportVersion = Schema.Literal('3.0.0-alpha.2')

export type DataExportVersion = typeof DataExportVersion.Type

// ============================================
// Settings for Export (simplified, no ID)
// ============================================

/**
 * User settings as included in export.
 * Excludes ID since it's user-specific.
 */
export class ExportedSettings extends Schema.Class<ExportedSettings, { readonly brand: unique symbol }>(
  'ExportedSettings'
)({
  weightUnit: Schema.Literals(['lbs', 'kg'] as const),
  timezone: IanaTimezone,
}) {}

// ============================================
// Data Export Schema
// ============================================

/**
 * Complete data export for a user.
 * Contains all user data in a portable, versioned format.
 */
export class DataExport extends Schema.Class<DataExport, { readonly brand: unique symbol }>('DataExport')({
  version: DataExportVersion,
  exportedAt: Schema.DateTimeUtc,
  data: Schema.Struct({
    weightLogs: Schema.Array(WeightLog),
    injectionLogs: Schema.Array(InjectionLog),
    schedules: Schema.Array(InjectionSchedule),
    goals: Schema.Array(UserGoal),
    settings: Schema.NullOr(ExportedSettings),
  }),
}) {}

// ============================================
// Import Result
// ============================================

/**
 * Summary of what was imported.
 */
export class DataImportResult extends Schema.Class<DataImportResult, { readonly brand: unique symbol }>(
  'DataImportResult'
)({
  weightLogs: Schema.Int,
  injectionLogs: Schema.Int,
  schedules: Schema.Int,
  goals: Schema.Int,
  settingsUpdated: Schema.Boolean,
}) {}

// ============================================
// Errors
// ============================================

export class DataExportError extends Schema.TaggedClass<DataExportError, { readonly brand: unique symbol }>()(
  'DataExportError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class DataImportError extends Schema.TaggedClass<DataImportError, { readonly brand: unique symbol }>()(
  'DataImportError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}
