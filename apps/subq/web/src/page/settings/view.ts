import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import type { WeightUnit } from '@garage/subq-domain/Values'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { button, card, input } from '../../ui.ts'
import {
  CancelledImportData,
  ChangedSettingsTimezone,
  ClickedExportData,
  ClickedSelectImportFile,
  ClickedSettingsWeightUnit,
  ConfirmedImportData,
  SubmittedSettingsTimezone,
} from './model.ts'
import type { SettingsModel, SettingsPageMessage } from './model.ts'
import { importSummary } from './update.ts'

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

  const viewDisplayPreferences = (model: SettingsModel, unit: WeightUnit, timezone: IanaTimezone) =>
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
                  unitButton(unit, 'lbs', 'Pounds (lbs)', model.preferenceSubmitting),
                  unitButton(unit, 'kg', 'Kilograms (kg)', model.preferenceSubmitting),
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

  const viewImportConfirm = (data: JournalSnapshot) =>
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
            h.p([h.Class('text-sm mb-4 font-mono bg-muted p-2 rounded')], [importSummary(data.data)]),
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

  return (model: SettingsModel, unit: WeightUnit, timezone: IanaTimezone) =>
    h.div(
      [],
      [
        h.h2([h.Class('text-xl font-semibold tracking-tight mb-6')], ['Settings']),
        viewDisplayPreferences(model, unit, timezone),
        viewDataManagement(model),
        model.importConfirm === null ? h.empty : viewImportConfirm(model.importConfirm),
      ]
    )
}

export const viewSettings = <ParentMessage>({
  h,
  model,
  unit,
  timezone,
}: {
  readonly h: HtmlBuilder<ParentMessage | SettingsPageMessage>
  readonly model: SettingsModel
  readonly unit: WeightUnit
  readonly timezone: IanaTimezone
}): Html => makeViewSettings(h)(model, unit, timezone)
