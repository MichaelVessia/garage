import * as Schema from 'effect/Schema'
import { File } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import { DataExport, DataImportResult } from '#shared'

// ============================================
// Model
// ============================================

export const PasswordForm = Schema.Struct({
  currentPassword: Schema.String,
  newPassword: Schema.String,
  confirmPassword: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  success: Schema.Boolean,
})

export type PasswordForm = typeof PasswordForm.Type

export const SettingsModel = Schema.Struct({
  preferenceSubmitting: Schema.Boolean,
  preferenceError: Schema.NullOr(Schema.String),
  timezoneInput: Schema.String,
  password: PasswordForm,
  exportStatus: Schema.Literals(['idle', 'exporting']),
  importStatus: Schema.Literals(['idle', 'reading', 'importing']),
  importConfirm: Schema.NullOr(DataExport),
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
  password: {
    confirmPassword: '',
    currentPassword: '',
    error: null,
    newPassword: '',
    submitting: false,
    success: false,
  },
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

export const ChangedSettingsCurrentPassword = taggedStruct('ChangedSettingsCurrentPassword', {
  value: Schema.String,
})

export const ChangedSettingsNewPassword = taggedStruct('ChangedSettingsNewPassword', { value: Schema.String })

export const ChangedSettingsConfirmPassword = taggedStruct('ChangedSettingsConfirmPassword', {
  value: Schema.String,
})

export const SubmittedSettingsPassword = taggedStruct('SubmittedSettingsPassword')
export const ClickedExportData = taggedStruct('ClickedExportData')
export const SucceededExportData = taggedStruct('SucceededExportData')
export const FailedExportData = taggedStruct('FailedExportData', { message: Schema.String })
export const ClickedSelectImportFile = taggedStruct('ClickedSelectImportFile')
export const SelectedImportFile = taggedStruct('SelectedImportFile', { file: File.File })
export const CancelledSelectImportFile = taggedStruct('CancelledSelectImportFile')
export const PreparedImportData = taggedStruct('PreparedImportData', { data: DataExport })
export const ConfirmedImportData = taggedStruct('ConfirmedImportData')
export const CancelledImportData = taggedStruct('CancelledImportData')
export const SucceededImportData = taggedStruct('SucceededImportData', { result: DataImportResult })
export const FailedImportData = taggedStruct('FailedImportData', { message: Schema.String })

export const SettingsPageMessage = Schema.Union([
  ClickedSettingsWeightUnit,
  ChangedSettingsTimezone,
  SubmittedSettingsTimezone,
  SucceededUpdateSettingsPreference,
  FailedUpdateSettingsPreference,
  ChangedSettingsCurrentPassword,
  ChangedSettingsNewPassword,
  ChangedSettingsConfirmPassword,
  SubmittedSettingsPassword,
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
