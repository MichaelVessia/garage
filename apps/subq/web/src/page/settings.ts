import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { HttpClient } from 'effect/unstable/http'
import { Command } from 'foldkit'
import * as File from 'foldkit/file'
import type { HtmlBuilder } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import {
  DataExport,
  DataExportTemporalMigrationRequired,
  DataImportResult,
  IanaTimezone,
  UserSettingsUpdate,
} from '#shared'
import type { WeightUnit } from '#shared'

import { downloadTextFile } from '../adapter/browser-download.js'
import { Api } from '../api.js'
import { ChangePassword } from '../auth.js'
import type { FailedChangePassword, SucceededChangePassword } from '../auth.js'
import { FetchSettings, weightUnitOf } from '../data/settings.js'
import type { FailedFetchSettings, SettingsData, SucceededFetchSettings } from '../data/settings.js'
import { toCommandResult } from '../lib/command.js'
import { button, card, input } from '../ui.js'

// ============================================
// Model
// ============================================

const PasswordForm = Schema.Struct({
  currentPassword: Schema.String,
  newPassword: Schema.String,
  confirmPassword: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  success: Schema.Boolean,
})
type PasswordForm = typeof PasswordForm.Type

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

export const ClickedSettingsWeightUnit = m('ClickedSettingsWeightUnit', {
  unit: Schema.Literals(['lbs', 'kg']),
})
export const ChangedSettingsTimezone = m('ChangedSettingsTimezone', { value: Schema.String })
export const SubmittedSettingsTimezone = m('SubmittedSettingsTimezone')
export const SucceededUpdateSettingsPreference = m('SucceededUpdateSettingsPreference')
export const FailedUpdateSettingsPreference = m('FailedUpdateSettingsPreference', {
  message: Schema.String,
})
export const ChangedSettingsCurrentPassword = m('ChangedSettingsCurrentPassword', {
  value: Schema.String,
})
export const ChangedSettingsNewPassword = m('ChangedSettingsNewPassword', { value: Schema.String })
export const ChangedSettingsConfirmPassword = m('ChangedSettingsConfirmPassword', {
  value: Schema.String,
})
export const SubmittedSettingsPassword = m('SubmittedSettingsPassword')
export const ClickedExportData = m('ClickedExportData')
export const SucceededExportData = m('SucceededExportData')
export const FailedExportData = m('FailedExportData', { message: Schema.String })
export const ClickedSelectImportFile = m('ClickedSelectImportFile')
export const SelectedImportFile = m('SelectedImportFile', { file: File.File })
export const CancelledSelectImportFile = m('CancelledSelectImportFile')
export const PreparedImportData = m('PreparedImportData', { data: DataExport })
export const ConfirmedImportData = m('ConfirmedImportData')
export const CancelledImportData = m('CancelledImportData')
export const SucceededImportData = m('SucceededImportData', { result: DataImportResult })
export const FailedImportData = m('FailedImportData', { message: Schema.String })

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

// ============================================
// Commands
// ============================================

const DataExportJson = Schema.fromJsonString(DataExport)

const UpdateWeightUnit = Command.define('UpdateSettingsWeightUnit', {
  args: { unit: Schema.Literals(['lbs', 'kg']) },
  messages: [SucceededUpdateSettingsPreference, FailedUpdateSettingsPreference],
  execute: ({ unit }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.UserSettingsUpdate(new UserSettingsUpdate({ weightUnit: unit }))
      return SucceededUpdateSettingsPreference()
    }).pipe(toCommandResult(FailedUpdateSettingsPreference, 'Failed to update display preferences')),
})

const UpdateTimezone = Command.define('UpdateSettingsTimezone', {
  args: { timezone: IanaTimezone },
  messages: [SucceededUpdateSettingsPreference, FailedUpdateSettingsPreference],
  execute: ({ timezone }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.UserSettingsUpdate(new UserSettingsUpdate({ timezone }))
      return SucceededUpdateSettingsPreference()
    }).pipe(toCommandResult(FailedUpdateSettingsPreference, 'Failed to update timezone')),
})

const ExportData = Command.define('ExportData', {
  messages: [SucceededExportData, FailedExportData],
  execute: Effect.gen(function* () {
    const result = yield* Effect.gen(function* () {
      const api = yield* Api
      const data = yield* api.UserDataExport()
      const json = yield* Schema.encodeEffect(DataExportJson)(data)
      const now = yield* DateTime.now
      const filename = `subq-export-${DateTime.formatIso(now).slice(0, 10)}.json`
      yield* downloadTextFile({ contents: json, filename, mediaType: 'application/json' })
      return SucceededExportData()
    }).pipe(Effect.result)

    return Match.value(result).pipe(
      Match.tagsExhaustive({
        Failure: ({ failure }) =>
          FailedExportData({
            message: Schema.is(DataExportTemporalMigrationRequired)(failure)
              ? failure.message
              : 'Failed to export data. Please try again.',
          }),
        Success: ({ success }) => success,
      })
    )
  }),
})

const SelectImportFile = Command.define('SelectImportFile', {
  messages: [SelectedImportFile, CancelledSelectImportFile],
  execute: File.select(['.json', 'application/json']).pipe(
    Effect.map(
      Option.match({
        onNone: () => CancelledSelectImportFile(),
        onSome: (file) => SelectedImportFile({ file }),
      })
    ),
    Effect.matchCause({
      onFailure: () => CancelledSelectImportFile(),
      onSuccess: (message) => message,
    })
  ),
})

const ReadImportFile = Command.define('ReadImportFile', {
  args: { file: File.File },
  messages: [PreparedImportData, FailedImportData],
  execute: ({ file }) =>
    Effect.tryPromise(() => file.text()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DataExportJson)),
      Effect.map((data) => PreparedImportData({ data })),
      toCommandResult(FailedImportData, 'Invalid export file. Only Subq 3.0.0-alpha.2 exports are supported.')
    ),
})

const ImportData = Command.define('ImportData', {
  args: { data: DataExport },
  messages: [SucceededImportData, FailedImportData],
  execute: ({ data }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const result = yield* api.UserDataImport(data)
      return SucceededImportData({ result })
    }).pipe(toCommandResult(FailedImportData, 'Failed to import data. Please try again.')),
})

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

type UpdateReturn = readonly [
  SettingsModel,
  ReadonlyArray<Command.Command<SettingsCommandMessage, never, Api | HttpClient.HttpClient>>,
]

const passwordError =
  (message: string) =>
  (form: PasswordForm): PasswordForm =>
    evo(form, { error: () => message, submitting: () => false, success: () => false })

export const settingsPasswordSucceeded = (model: SettingsModel): SettingsModel =>
  evo(model, {
    password: () => ({
      confirmPassword: '',
      currentPassword: '',
      error: null,
      newPassword: '',
      submitting: false,
      success: true,
    }),
  })

export const settingsPasswordFailed = (model: SettingsModel, message: string): SettingsModel =>
  evo(model, { password: (form) => passwordError(message)(form) })

const importSummary = (data: DataExport): string => {
  const records = data.data
  return `${records.weightLogs.length} weight logs, ${records.injectionLogs.length} injection logs, ${records.schedules.length} schedules, ${records.goals.length} goals`
}

const importResultMessage = (result: DataImportResult): string =>
  `Successfully imported: ${result.weightLogs} weight logs, ${result.injectionLogs} injection logs, ${result.schedules} schedules, ${result.goals} goals`

export const updateSettingsPage = (
  model: SettingsModel,
  message: SettingsPageMessage,
  currentTimezone: IanaTimezone,
  detectedTimezone: IanaTimezone,
  settingsRequestGeneration: number
): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledImportData: () => [evo(model, { importConfirm: () => null, importStatus: () => 'idle' }), []],
      CancelledSelectImportFile: () => [evo(model, { importStatus: () => 'idle' }), []],
      ChangedSettingsTimezone: ({ value }) => [
        evo(model, { preferenceError: () => null, timezoneInput: () => value }),
        [],
      ],
      ChangedSettingsConfirmPassword: ({ value }) => [
        evo(model, {
          password: (form) => evo(form, { confirmPassword: () => value, success: () => false }),
        }),
        [],
      ],
      ChangedSettingsCurrentPassword: ({ value }) => [
        evo(model, {
          password: (form) => evo(form, { currentPassword: () => value, success: () => false }),
        }),
        [],
      ],
      ChangedSettingsNewPassword: ({ value }) => [
        evo(model, {
          password: (form) => evo(form, { newPassword: () => value, success: () => false }),
        }),
        [],
      ],
      ClickedExportData: () => [
        evo(model, {
          dataError: () => null,
          dataSuccess: () => null,
          exportStatus: () => 'exporting',
        }),
        [ExportData()],
      ],
      ClickedSelectImportFile: () => [
        evo(model, {
          dataError: () => null,
          dataSuccess: () => null,
          importConfirm: () => null,
          importStatus: () => 'reading',
        }),
        [SelectImportFile()],
      ],
      ClickedSettingsWeightUnit: ({ unit }) => [
        evo(model, { preferenceError: () => null, preferenceSubmitting: () => true }),
        [UpdateWeightUnit({ unit })],
      ],
      ConfirmedImportData: () =>
        model.importConfirm === null
          ? [model, []]
          : [
              evo(model, {
                dataError: () => null,
                dataSuccess: () => null,
                importStatus: () => 'importing',
              }),
              [ImportData({ data: model.importConfirm })],
            ],
      FailedExportData: ({ message: error }) => [
        evo(model, { dataError: () => error, exportStatus: () => 'idle' }),
        [],
      ],
      FailedImportData: ({ message: error }) => [
        evo(model, {
          dataError: () => error,
          importConfirm: () => null,
          importStatus: () => 'idle',
        }),
        [],
      ],
      FailedUpdateSettingsPreference: ({ message: error }) => [
        evo(model, { preferenceError: () => error, preferenceSubmitting: () => false }),
        [],
      ],
      PreparedImportData: ({ data }) => [
        evo(model, {
          importConfirm: () => data,
          importStatus: () => 'idle',
        }),
        [],
      ],
      SelectedImportFile: ({ file }) => [model, [ReadImportFile({ file })]],
      SubmittedSettingsTimezone: () => {
        const candidate = model.timezoneInput === '' ? currentTimezone : model.timezoneInput
        const timezone = Schema.decodeUnknownOption(IanaTimezone)(candidate)
        return Option.match(timezone, {
          onNone: (): UpdateReturn => [evo(model, { preferenceError: () => 'Enter a valid IANA timezone' }), []],
          onSome: (validTimezone): UpdateReturn => [
            evo(model, { preferenceError: () => null, preferenceSubmitting: () => true }),
            [UpdateTimezone({ timezone: validTimezone })],
          ],
        })
      },
      SubmittedSettingsPassword: () => {
        if (model.password.currentPassword === '') {
          return [evo(model, { password: passwordError('Current password is required') }), []]
        }
        if (model.password.newPassword.length < 8) {
          return [
            evo(model, {
              password: passwordError('Password must be at least 8 characters'),
            }),
            [],
          ]
        }
        if (model.password.newPassword !== model.password.confirmPassword) {
          return [evo(model, { password: passwordError('Passwords do not match') }), []]
        }
        return [
          evo(model, {
            password: (form) => evo(form, { error: () => null, submitting: () => true, success: () => false }),
          }),
          [
            ChangePassword({
              currentPassword: model.password.currentPassword,
              newPassword: model.password.newPassword,
            }),
          ],
        ]
      },
      SucceededExportData: () => [
        evo(model, {
          dataSuccess: () => 'Data exported successfully',
          exportStatus: () => 'idle',
        }),
        [],
      ],
      SucceededImportData: ({ result }) => [
        evo(model, {
          dataSuccess: () => importResultMessage(result),
          importConfirm: () => null,
          importStatus: () => 'idle',
        }),
        [
          FetchSettings({
            detectedTimezone: result.settingsUpdated ? currentTimezone : detectedTimezone,
            requestGeneration: settingsRequestGeneration,
          }),
        ],
      ],
      SucceededUpdateSettingsPreference: () => [
        evo(model, { preferenceError: () => null, preferenceSubmitting: () => false, timezoneInput: () => '' }),
        [FetchSettings({ detectedTimezone: currentTimezone, requestGeneration: settingsRequestGeneration })],
      ],
    })
  )

// ============================================
// View
// ============================================

const makeViewSettings = <ParentMessage>(h: HtmlBuilder<ParentMessage | SettingsPageMessage>) => {
  const viewCard = (title: string, children: ReadonlyArray<ReturnType<typeof h.div>>) =>
    h.div(
      [h.Class(card({ class: 'mb-6' }))],
      [
        h.div(
          [h.Class('flex flex-col space-y-1.5 p-6')],
          [h.h3([h.Class('text-lg font-semibold leading-none tracking-tight')], [title])]
        ),
        h.div([h.Class('p-6 pt-0')], children),
      ]
    )

  const unitButton = (current: WeightUnit, unit: WeightUnit, label: string, submitting: boolean) =>
    h.button(
      [
        h.Class(button({ variant: current === unit ? 'default' : 'outline' })),
        h.Disabled(submitting),
        h.OnClick(ClickedSettingsWeightUnit({ unit })),
      ],
      [label]
    )

  const viewDisplayPreferences = (model: SettingsModel, settings: SettingsData, timezone: IanaTimezone) =>
    viewCard('Display Preferences', [
      h.div(
        [h.Class('space-y-4')],
        [
          h.div(
            [],
            [
              h.label([h.Class('mb-3 block text-sm font-medium')], ['Weight Unit']),
              h.p(
                [h.Class('text-sm text-muted-foreground mb-4')],
                ['Choose how weights are displayed throughout the app.']
              ),
              h.div(
                [h.Class('flex flex-wrap gap-3')],
                [
                  unitButton(weightUnitOf(settings), 'lbs', 'Pounds (lbs)', model.preferenceSubmitting),
                  unitButton(weightUnitOf(settings), 'kg', 'Kilograms (kg)', model.preferenceSubmitting),
                ]
              ),
            ]
          ),
          h.form(
            [h.Class('border-t pt-4 space-y-3'), h.OnSubmit(SubmittedSettingsTimezone())],
            [
              h.label([h.For('settings-timezone'), h.Class('block text-sm font-medium')], ['Timezone']),
              h.p(
                [h.Class('text-sm text-muted-foreground')],
                ['Used to project event timestamps onto local calendar days. Planned dates never change.']
              ),
              h.div(
                [h.Class('flex flex-col gap-3 sm:flex-row')],
                [
                  h.input([
                    h.Class(input()),
                    h.Id('settings-timezone'),
                    h.Type('text'),
                    h.Value(model.timezoneInput === '' ? timezone : model.timezoneInput),
                    h.OnInput((value) => ChangedSettingsTimezone({ value })),
                  ]),
                  h.button(
                    [h.Class(button()), h.Type('submit'), h.Disabled(model.preferenceSubmitting)],
                    [model.preferenceSubmitting ? 'Saving...' : 'Save Timezone']
                  ),
                ]
              ),
            ]
          ),
          model.preferenceError === null
            ? h.empty
            : h.p([h.Class('text-sm text-destructive')], [model.preferenceError]),
        ]
      ),
    ])

  const viewPasswordForm = (form: PasswordForm) =>
    viewCard('Change Password', [
      form.success ? h.p([h.Class('text-sm text-green-600 mb-4')], ['Password changed successfully']) : h.empty,
      h.form(
        [h.Class('space-y-4'), h.OnSubmit(SubmittedSettingsPassword())],
        [
          h.div(
            [],
            [
              h.label([h.For('currentPassword'), h.Class('mb-2 block text-sm font-medium')], ['Current Password']),
              h.input([
                h.Class(input()),
                h.Id('currentPassword'),
                h.Type('password'),
                h.Value(form.currentPassword),
                h.OnInput((value) => ChangedSettingsCurrentPassword({ value })),
              ]),
            ]
          ),
          h.div(
            [],
            [
              h.label([h.For('newPassword'), h.Class('mb-2 block text-sm font-medium')], ['New Password']),
              h.input([
                h.Class(input()),
                h.Id('newPassword'),
                h.Type('password'),
                h.Value(form.newPassword),
                h.OnInput((value) => ChangedSettingsNewPassword({ value })),
              ]),
            ]
          ),
          h.div(
            [],
            [
              h.label([h.For('confirmPassword'), h.Class('mb-2 block text-sm font-medium')], ['Confirm New Password']),
              h.input([
                h.Class(input()),
                h.Id('confirmPassword'),
                h.Type('password'),
                h.Value(form.confirmPassword),
                h.OnInput((value) => ChangedSettingsConfirmPassword({ value })),
              ]),
            ]
          ),
          form.error === null ? h.empty : h.p([h.Class('text-sm text-destructive')], [form.error]),
          h.button(
            [h.Class(button()), h.Type('submit'), h.Disabled(form.submitting)],
            [form.submitting ? 'Changing...' : 'Change Password']
          ),
        ]
      ),
    ])

  const viewDataManagement = (model: SettingsModel) =>
    viewCard('Data Management', [
      h.div(
        [h.Class('space-y-4')],
        [
          h.div(
            [],
            [
              h.h4([h.Class('font-medium mb-2')], ['Export Data']),
              h.p(
                [h.Class('text-sm text-muted-foreground mb-3')],
                ['Download all your data as a JSON file for backup purposes.']
              ),
              h.button(
                [
                  h.Class(button({ variant: 'outline' })),
                  h.Disabled(model.exportStatus === 'exporting'),
                  h.OnClick(ClickedExportData()),
                ],
                [model.exportStatus === 'exporting' ? 'Exporting...' : 'Export Data']
              ),
            ]
          ),
          h.div(
            [h.Class('border-t pt-4')],
            [
              h.h4([h.Class('font-medium mb-2')], ['Import Data']),
              h.p(
                [h.Class('text-sm text-muted-foreground mb-3')],
                ['Restore data from a previously exported file. This will replace all existing data.']
              ),
              h.button(
                [
                  h.Class(button({ variant: 'outline' })),
                  h.Disabled(model.importStatus !== 'idle'),
                  h.OnClick(ClickedSelectImportFile()),
                ],
                [model.importStatus === 'idle' ? 'Import Data' : 'Importing...']
              ),
            ]
          ),
          model.dataError === null
            ? h.empty
            : h.div(
                [
                  h.Class(
                    'bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm'
                  ),
                ],
                [model.dataError]
              ),
          model.dataSuccess === null
            ? h.empty
            : h.div(
                [
                  h.Class(
                    'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 px-4 py-3 rounded-md text-sm'
                  ),
                ],
                [model.dataSuccess]
              ),
        ]
      ),
    ])

  const viewImportConfirm = (data: DataExport) =>
    h.div(
      [h.Class('fixed inset-0 bg-black/50 flex items-center justify-center z-50')],
      [
        h.div(
          [h.Class('bg-background border rounded-lg p-6 max-w-md mx-4 shadow-lg')],
          [
            h.h3([h.Class('text-lg font-semibold mb-2')], ['Confirm Import']),
            h.p(
              [h.Class('text-sm text-muted-foreground mb-4')],
              ['This will ', h.strong([], ['replace all your existing data']), ' with the imported data:']
            ),
            h.p([h.Class('text-sm mb-4 font-mono bg-muted p-2 rounded')], [importSummary(data)]),
            h.p([h.Class('text-sm text-destructive mb-4')], ['This action cannot be undone.']),
            h.div(
              [h.Class('flex gap-3 justify-end')],
              [
                h.button([h.Class(button({ variant: 'outline' })), h.OnClick(CancelledImportData())], ['Cancel']),
                h.button(
                  [h.Class(button({ variant: 'destructive' })), h.OnClick(ConfirmedImportData())],
                  ['Replace All Data']
                ),
              ]
            ),
          ]
        ),
      ]
    )

  return (model: SettingsModel, settings: SettingsData, timezone: IanaTimezone) =>
    h.div(
      [],
      [
        h.h2([h.Class('text-xl font-semibold tracking-tight mb-6')], ['Settings']),
        viewDisplayPreferences(model, settings, timezone),
        viewPasswordForm(model.password),
        viewDataManagement(model),
        model.importConfirm === null ? h.empty : viewImportConfirm(model.importConfirm),
      ]
    )
}

export const viewSettings = <ParentMessage>(
  model: SettingsModel,
  settings: SettingsData,
  timezone: IanaTimezone,
  h: HtmlBuilder<ParentMessage | SettingsPageMessage>
) => makeViewSettings(h)(model, settings, timezone)
