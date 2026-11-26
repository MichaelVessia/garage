import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import type { WeightUnit } from '@garage/subq-domain/Values'

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

const makeViewSettings = <ParentMessage>(h: Html.H<ParentMessage | SettingsPageMessage>) => {
  const viewCard = (title: string, children: View.Children<ParentMessage | SettingsPageMessage, never>) =>
    h.div
      .class(card({ class: 'mb-6' }))
      .children(
        h.div
          .class('flex flex-col space-y-1.5 p-6')
          .children(h.h3.class('text-lg font-semibold leading-none tracking-tight').children(title)),
        h.div.class('p-6 pt-0').children(children)
      )

  const unitButton = (current: WeightUnit, unit: WeightUnit, label: string, submitting: boolean) =>
    h.button
      .class(button({ variant: current === unit ? 'default' : 'outline' }))
      .disabled(submitting)
      .on('click', ClickedSettingsWeightUnit({ unit }))
      .children(label)

  const viewDisplayPreferences = (model: SettingsModel, unit: WeightUnit, timezone: IanaTimezone) =>
    viewCard('Display Preferences', [
      h.div.class('space-y-4').children(
        h.div.children(
          h.label.class('mb-3 block text-sm font-medium').children('Weight Unit'),
          h.p
            .class('text-sm text-muted-foreground mb-4')
            .children('Choose how weights are displayed throughout the app.'),
          h.div
            .class('flex flex-wrap gap-3')
            .children(
              unitButton(unit, 'lbs', 'Pounds (lbs)', model.preferenceSubmitting),
              unitButton(unit, 'kg', 'Kilograms (kg)', model.preferenceSubmitting)
            )
        ),
        h.form
          .class('border-t pt-4 space-y-3')
          .on('submit', SubmittedSettingsTimezone())
          .children(
            h.label.attr('for', 'settings-timezone').class('block text-sm font-medium').children('Timezone'),
            h.p
              .class('text-sm text-muted-foreground')
              .children('Used to project event timestamps onto local calendar days. Planned dates never change.'),
            h.div.class('flex flex-col gap-3 sm:flex-row').children(
              h.input
                .class(input())
                .attr('id', 'settings-timezone')
                .attr('type', 'text')
                .value(model.timezoneInput === '' ? timezone : model.timezoneInput)
                .on('input', ({ value }) => ChangedSettingsTimezone({ value })),
              h.button
                .class(button())
                .attr('type', 'submit')
                .disabled(model.preferenceSubmitting)
                .children(model.preferenceSubmitting ? 'Saving...' : 'Save Timezone')
            )
          ),
        model.preferenceError === null ? null : h.p.class('text-sm text-destructive').children(model.preferenceError)
      ),
    ])

  const viewDataManagement = (model: SettingsModel) =>
    viewCard('Data Management', [
      h.div.class('space-y-4').children(
        h.div.children(
          h.h4.class('font-medium mb-2').children('Export Data'),
          h.p
            .class('text-sm text-muted-foreground mb-3')
            .children('Download all your data as a JSON file for backup purposes.'),
          h.button
            .class(button({ variant: 'outline' }))
            .disabled(model.exportStatus === 'exporting')
            .on('click', ClickedExportData())
            .children(model.exportStatus === 'exporting' ? 'Exporting...' : 'Export Data')
        ),
        h.div.class('border-t pt-4').children(
          h.h4.class('font-medium mb-2').children('Import Data'),
          h.p
            .class('text-sm text-muted-foreground mb-3')
            .children('Restore data from a previously exported file. This will replace all existing data.'),
          h.button
            .class(button({ variant: 'outline' }))
            .disabled(model.importStatus !== 'idle')
            .on('click', ClickedSelectImportFile())
            .children(model.importStatus === 'idle' ? 'Import Data' : 'Importing...')
        ),
        model.dataError === null
          ? null
          : h.div
              .class('bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm')
              .children(model.dataError),
        model.dataSuccess === null
          ? null
          : h.div
              .class(
                'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 px-4 py-3 rounded-md text-sm'
              )
              .children(model.dataSuccess)
      ),
    ])

  const viewImportConfirm = (data: JournalSnapshot) =>
    h.div.class('fixed inset-0 bg-black/50 flex items-center justify-center z-50').children(
      h.div.class('bg-background border rounded-lg p-6 max-w-md mx-4 shadow-lg').children(
        h.h3.class('text-lg font-semibold mb-2').children('Confirm Import'),
        h.p
          .class('text-sm text-muted-foreground mb-4')
          .children('This will ', h.strong.children('replace all your existing data'), ' with the imported data:'),
        h.p.class('text-sm mb-4 font-mono bg-muted p-2 rounded').children(importSummary(data.data)),
        h.p.class('text-sm text-destructive mb-4').children('This action cannot be undone.'),
        h.div.class('flex gap-3 justify-end').children(
          h.button
            .class(button({ variant: 'outline' }))
            .on('click', CancelledImportData())
            .children('Cancel'),
          h.button
            .class(button({ variant: 'destructive' }))
            .on('click', ConfirmedImportData())
            .children('Replace All Data')
        )
      )
    )

  return (model: SettingsModel, unit: WeightUnit, timezone: IanaTimezone) =>
    h.div.children(
      h.h2.class('text-xl font-semibold tracking-tight mb-6').children('Settings'),
      viewDisplayPreferences(model, unit, timezone),
      viewDataManagement(model),
      model.importConfirm === null ? null : viewImportConfirm(model.importConfirm)
    )
}

export const viewSettings = <ParentMessage>({
  h,
  model,
  unit,
  timezone,
}: {
  readonly h: Html.H<ParentMessage | SettingsPageMessage>
  readonly model: SettingsModel
  readonly unit: WeightUnit
  readonly timezone: IanaTimezone
}): View.Content<ParentMessage | SettingsPageMessage> => makeViewSettings(h)(model, unit, timezone)
