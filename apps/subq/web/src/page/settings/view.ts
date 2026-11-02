import type { Html, HtmlBuilder } from 'foldkit/html'

import type { DataExport, IanaTimezone, WeightUnit } from '#shared'

import { weightUnitOf } from '../../data/settings.js'
import type { SettingsData } from '../../data/settings.js'
import { button, card, input } from '../../ui.js'
import {
  CancelledImportData,
  ChangedSettingsConfirmPassword,
  ChangedSettingsCurrentPassword,
  ChangedSettingsNewPassword,
  ChangedSettingsTimezone,
  ClickedExportData,
  ClickedSelectImportFile,
  ClickedSettingsWeightUnit,
  ConfirmedImportData,
  SubmittedSettingsPassword,
  SubmittedSettingsTimezone,
} from './model.js'
import type { PasswordForm, SettingsModel, SettingsPageMessage } from './model.js'

const importSummary = (data: DataExport): string => {
  const records = data.data

  return `${records.weightLogs.length} weight logs, ${records.injectionLogs.length} injection logs, ${records.schedules.length} schedules, ${records.goals.length} goals`
}

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

export const viewSettings = <ParentMessage>({
  h,
  model,
  settings,
  timezone,
}: {
  readonly h: HtmlBuilder<ParentMessage | SettingsPageMessage>
  readonly model: SettingsModel
  readonly settings: SettingsData
  readonly timezone: IanaTimezone
}): Html => makeViewSettings(h)(model, settings, timezone)
