import { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import * as Schema from 'effect/Schema'
import { File } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

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

export const ClickedSettingsWeightUnit = taggedStruct('ClickedSettingsWeightUnit', {
  unit: Schema.Literals(['lbs', 'kg']),
})

export const ChangedSettingsTimezone = taggedStruct('ChangedSettingsTimezone', { value: Schema.String })

export const SubmittedSettingsTimezone = taggedStruct('SubmittedSettingsTimezone')

export const SucceededUpdateSettingsPreference = taggedStruct('SucceededUpdateSettingsPreference')

export const FailedUpdateSettingsPreference = taggedStruct('FailedUpdateSettingsPreference', {
  message: Schema.String,
})

export const ClickedExportData = taggedStruct('ClickedExportData')

export const SucceededExportData = taggedStruct('SucceededExportData')

export const FailedExportData = taggedStruct('FailedExportData', { message: Schema.String })

export const ClickedSelectImportFile = taggedStruct('ClickedSelectImportFile')

export const SelectedImportFile = taggedStruct('SelectedImportFile', { file: File.File })

export const CancelledSelectImportFile = taggedStruct('CancelledSelectImportFile')

export const PreparedImportData = taggedStruct('PreparedImportData', { data: JournalSnapshot })

export const ConfirmedImportData = taggedStruct('ConfirmedImportData')

export const CancelledImportData = taggedStruct('CancelledImportData')

export const SucceededImportData = taggedStruct('SucceededImportData', { summary: Schema.String })

export const FailedImportData = taggedStruct('FailedImportData', { message: Schema.String })

export const SettingsPageMessage = Schema.Union([
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
])

export type SettingsPageMessage = typeof SettingsPageMessage.Type
