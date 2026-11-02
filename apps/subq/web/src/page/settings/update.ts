import * as Function from 'effect/Function'
import type * as HttpClient from 'effect/http/HttpClient'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { IanaTimezone } from '#shared'
import type { DataImportResult } from '#shared'

import type { Api } from '../../api.js'
import { ChangePassword } from '../../auth.js'
import type { FailedChangePassword, SucceededChangePassword } from '../../auth.js'
import { FetchSettings } from '../../data/settings.js'
import type { FailedFetchSettings, SucceededFetchSettings } from '../../data/settings.js'
import {
  ExportData,
  ImportData,
  ReadImportFile,
  SelectImportFile,
  UpdateTimezone,
  UpdateWeightUnit,
} from './command.js'
import type {
  CancelledSelectImportFile,
  FailedExportData,
  FailedImportData,
  FailedUpdateSettingsPreference,
  PasswordForm,
  PreparedImportData,
  SelectedImportFile,
  SettingsModel,
  SettingsPageMessage,
  SucceededExportData,
  SucceededImportData,
  SucceededUpdateSettingsPreference,
} from './model.js'

// ============================================
// Update
// ============================================

type SettingsCommandMessage =
  | typeof SucceededUpdateSettingsPreference.Type
  | typeof FailedUpdateSettingsPreference.Type
  | typeof SucceededChangePassword.Type
  | typeof FailedChangePassword.Type
  | typeof SucceededExportData.Type
  | typeof FailedExportData.Type
  | typeof SelectedImportFile.Type
  | typeof CancelledSelectImportFile.Type
  | typeof PreparedImportData.Type
  | typeof SucceededImportData.Type
  | typeof FailedImportData.Type
  | typeof SucceededFetchSettings.Type
  | typeof FailedFetchSettings.Type

type UpdateReturn = Update.Return<SettingsModel, SettingsCommandMessage, Api | HttpClient.HttpClient>

const passwordError =
  (message: string) =>
  (form: PasswordForm): PasswordForm =>
    modifyFields(form, { error: () => message, submitting: () => false, success: () => false })

export const settingsPasswordSucceeded = (model: SettingsModel): SettingsModel =>
  modifyFields(model, {
    password: () => ({
      confirmPassword: '',
      currentPassword: '',
      error: null,
      newPassword: '',
      submitting: false,
      success: true,
    }),
  })

export const settingsPasswordFailed: {
  (message: string): (model: SettingsModel) => SettingsModel
  (model: SettingsModel, message: string): SettingsModel
} = Function.dual(2, (model: SettingsModel, message: string): SettingsModel =>
  modifyFields(model, { password: (form) => passwordError(message)(form) })
)

const importResultMessage = (result: DataImportResult): string =>
  `Successfully imported: ${result.weightLogs} weight logs, ${result.injectionLogs} injection logs, ${result.schedules} schedules, ${result.goals} goals`

export const updateSettingsPage: {
  (
    message: SettingsPageMessage,
    currentTimezone: IanaTimezone,
    detectedTimezone: IanaTimezone,
    settingsRequestGeneration: number
  ): (model: SettingsModel) => UpdateReturn
  (
    model: SettingsModel,
    message: SettingsPageMessage,
    currentTimezone: IanaTimezone,
    detectedTimezone: IanaTimezone,
    settingsRequestGeneration: number
  ): UpdateReturn
} = Function.dual(
  5,
  (
    model: SettingsModel,
    message: SettingsPageMessage,
    currentTimezone: IanaTimezone,
    detectedTimezone: IanaTimezone,
    settingsRequestGeneration: number
  ): UpdateReturn =>
    Match.value(message).pipe(
      Match.withReturnType<UpdateReturn>(),
      Match.tagsExhaustive({
        CancelledImportData: () => ({
          model: modifyFields(model, { importConfirm: () => null, importStatus: () => 'idle' }),
        }),
        CancelledSelectImportFile: () => ({ model: modifyFields(model, { importStatus: () => 'idle' }) }),
        ChangedSettingsTimezone: ({ value }) => ({
          model: modifyFields(model, { preferenceError: () => null, timezoneInput: () => value }),
        }),
        ChangedSettingsConfirmPassword: ({ value }) => ({
          model: modifyFields(model, {
            password: (form) => modifyFields(form, { confirmPassword: () => value, success: () => false }),
          }),
        }),
        ChangedSettingsCurrentPassword: ({ value }) => ({
          model: modifyFields(model, {
            password: (form) => modifyFields(form, { currentPassword: () => value, success: () => false }),
          }),
        }),
        ChangedSettingsNewPassword: ({ value }) => ({
          model: modifyFields(model, {
            password: (form) => modifyFields(form, { newPassword: () => value, success: () => false }),
          }),
        }),
        ClickedExportData: () => ({
          model: modifyFields(model, {
            dataError: () => null,
            dataSuccess: () => null,
            exportStatus: () => 'exporting',
          }),
          commands: [ExportData()],
        }),
        ClickedSelectImportFile: () => ({
          model: modifyFields(model, {
            dataError: () => null,
            dataSuccess: () => null,
            importConfirm: () => null,
            importStatus: () => 'reading',
          }),
          commands: [SelectImportFile()],
        }),
        ClickedSettingsWeightUnit: ({ unit }) => ({
          model: modifyFields(model, { preferenceError: () => null, preferenceSubmitting: () => true }),
          commands: [UpdateWeightUnit({ unit })],
        }),
        ConfirmedImportData: () =>
          model.importConfirm === null
            ? { model }
            : {
                model: modifyFields(model, {
                  dataError: () => null,
                  dataSuccess: () => null,
                  importStatus: () => 'importing',
                }),
                commands: [ImportData({ data: model.importConfirm })],
              },
        FailedExportData: ({ message: error }) => ({
          model: modifyFields(model, { dataError: () => error, exportStatus: () => 'idle' }),
        }),
        FailedImportData: ({ message: error }) => ({
          model: modifyFields(model, {
            dataError: () => error,
            importConfirm: () => null,
            importStatus: () => 'idle',
          }),
        }),
        FailedUpdateSettingsPreference: ({ message: error }) => ({
          model: modifyFields(model, { preferenceError: () => error, preferenceSubmitting: () => false }),
        }),
        PreparedImportData: ({ data }) => ({
          model: modifyFields(model, {
            importConfirm: () => data,
            importStatus: () => 'idle',
          }),
        }),
        SelectedImportFile: ({ file }) => ({ model, commands: [ReadImportFile({ file })] }),
        SubmittedSettingsTimezone: () => {
          const candidate = model.timezoneInput === '' ? currentTimezone : model.timezoneInput
          const timezone = Schema.decodeOption(IanaTimezone)(candidate)

          return Option.match(timezone, {
            onNone: (): UpdateReturn => ({
              model: modifyFields(model, { preferenceError: () => 'Enter a valid IANA timezone' }),
            }),
            onSome: (validTimezone): UpdateReturn => ({
              model: modifyFields(model, { preferenceError: () => null, preferenceSubmitting: () => true }),
              commands: [UpdateTimezone({ timezone: validTimezone })],
            }),
          })
        },
        SubmittedSettingsPassword: () => {
          if (model.password.currentPassword === '') {
            return { model: modifyFields(model, { password: passwordError('Current password is required') }) }
          }

          if (model.password.newPassword.length < 8) {
            return {
              model: modifyFields(model, {
                password: passwordError('Password must be at least 8 characters'),
              }),
            }
          }

          if (model.password.newPassword !== model.password.confirmPassword) {
            return { model: modifyFields(model, { password: passwordError('Passwords do not match') }) }
          }

          return {
            model: modifyFields(model, {
              password: (form) =>
                modifyFields(form, { error: () => null, submitting: () => true, success: () => false }),
            }),
            commands: [
              ChangePassword({
                currentPassword: model.password.currentPassword,
                newPassword: model.password.newPassword,
              }),
            ],
          }
        },
        SucceededExportData: () => ({
          model: modifyFields(model, {
            dataSuccess: () => 'Data exported successfully',
            exportStatus: () => 'idle',
          }),
        }),
        SucceededImportData: ({ result }) => ({
          model: modifyFields(model, {
            dataSuccess: () => importResultMessage(result),
            importConfirm: () => null,
            importStatus: () => 'idle',
          }),
          commands: [
            FetchSettings({
              detectedTimezone: result.settingsUpdated ? currentTimezone : detectedTimezone,
              requestGeneration: settingsRequestGeneration,
            }),
          ],
        }),
        SucceededUpdateSettingsPreference: () => ({
          model: modifyFields(model, {
            preferenceError: () => null,
            preferenceSubmitting: () => false,
            timezoneInput: () => '',
          }),
          commands: [
            FetchSettings({ detectedTimezone: currentTimezone, requestGeneration: settingsRequestGeneration }),
          ],
        }),
      })
    )
)
