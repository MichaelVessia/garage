import { UiSchema } from '@effect/ui'
import { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import * as Schema from 'effect/Schema'

// ============================================
// Model
// ============================================

export const SettingsModel = Schema.Struct({
  preferenceSubmitting: Schema.Boolean,
  preferenceError: Schema.NullOr(Schema.String),
  timezoneInput: Schema.String,
  exportStatus: Schema.Literals(['idle', 'exporting']),
  importStatus: Schema.Literals(['idle', 'reading', 'confirming', 'importing']),
  importConfirm: Schema.NullOr(JournalSnapshot),
  dataError: Schema.NullOr(Schema.String),
  dataSuccess: Schema.NullOr(Schema.String),
})

export type SettingsModel = typeof SettingsModel.Type

export const initialSettingsModel: SettingsModel = {
  dataError: null,
  dataSuccess: null,
  exportStatus: 'idle',
  importConfirm: null,
  importStatus: 'idle',
  preferenceError: null,
  preferenceSubmitting: false,
  timezoneInput: '',
}

// ============================================
// Messages
// ============================================

export const SettingsPageMessage = UiSchema.TaggedEnum({
  ClickedSettingsWeightUnit: {
    unit: Schema.Literals(['lbs', 'kg']),
  },
  ChangedSettingsTimezone: { value: Schema.String },
  SubmittedSettingsTimezone: {},
  SucceededUpdateSettingsPreference: {},
  FailedUpdateSettingsPreference: {
    message: Schema.String,
  },
  ClickedExportData: {},
  SucceededExportData: {},
  FailedExportData: { message: Schema.String },
  ClickedSelectImportFile: {},
  SelectedImportFile: { file: Schema.instanceOf(File) },
  CancelledSelectImportFile: {},
  PreparedImportData: { data: JournalSnapshot },
  ConfirmedImportData: {},
  CancelledImportData: {},
  SucceededImportData: { summary: Schema.String },
  FailedImportData: { message: Schema.String },
})

export const {
  ClickedSettingsWeightUnit,
  ChangedSettingsTimezone,
  SubmittedSettingsTimezone,
  SucceededUpdateSettingsPreference,
  FailedUpdateSettingsPreference,
  ClickedExportData,
  SucceededExportData,
  FailedExportData,
  ClickedSelectImportFile,
  SelectedImportFile,
  CancelledSelectImportFile,
  PreparedImportData,
  ConfirmedImportData,
  CancelledImportData,
  SucceededImportData,
  FailedImportData,
} = SettingsPageMessage

export type SettingsPageMessage = typeof SettingsPageMessage.Type
