import { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { CalendarDate } from '@garage/subq-domain/Calendar'
import type { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import { ImportJournal } from '@garage/subq-domain/Journal/ImportJournal.command'
import type { Preferences } from '@garage/subq-domain/Journal/JournalRecords'
import { UpdatePreferences } from '@garage/subq-domain/Journal/UpdatePreferences.command'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { mutate } from '../../client.ts'
import type { PageUpdate } from '../../client.ts'
import { ExportData, ReadImportFile, selectImportFile } from './command.ts'
import {
  FailedImportData,
  FailedUpdateSettingsPreference,
  SucceededImportData,
  SucceededUpdateSettingsPreference,
} from './model.ts'
import type { SettingsModel, SettingsPageMessage } from './model.ts'

type UpdateReturn = PageUpdate<SettingsModel, SettingsPageMessage>
type SnapshotData = JournalSnapshot['data']

export const importSummary = ({ weights, injections, schedules, goals }: SnapshotData): string =>
  `${weights.length} weight logs, ${injections.length} injection logs, ${schedules.length} schedules, ${goals.length} goals`

const updatePreferences = (model: SettingsModel, input: Preferences): UpdateReturn => ({
  model: { ...model, preferenceSubmitting: true, preferenceError: null },
  mutation: mutate(
    () => UpdatePreferences.make(input),
    SucceededUpdateSettingsPreference(),
    (message) => FailedUpdateSettingsPreference({ message })
  ),
})

// @effect-diagnostics-next-line missingPipeableSignature:off -- The reducer takes the current page state and its journal data.
export const updateSettingsPage = (
  model: SettingsModel,
  message: SettingsPageMessage,
  data: SnapshotData,
  today: CalendarDate,
  timezone: IanaTimezone
): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ChangedSettingsTimezone: ({ value }) => ({ model: { ...model, timezoneInput: value, preferenceError: null } }),
      ClickedSettingsWeightUnit: ({ unit }) => updatePreferences(model, { weightUnit: unit }),
      SubmittedSettingsTimezone: () => {
        const input = Str.trim(model.timezoneInput)
        if (input === '') {
          return { model }
        }
        if (!Schema.is(IanaTimezone)(input)) {
          return { model: { ...model, preferenceError: 'Enter a valid IANA timezone, such as America/New_York.' } }
        }
        return updatePreferences(model, { timezone: input })
      },
      SucceededUpdateSettingsPreference: () => ({
        model: { ...model, preferenceSubmitting: false, preferenceError: null, timezoneInput: '' },
      }),
      FailedUpdateSettingsPreference: ({ message }) => ({
        model: { ...model, preferenceSubmitting: false, preferenceError: message },
      }),
      ClickedExportData: () => ({
        model: { ...model, exportStatus: 'exporting', dataError: null, dataSuccess: null },
        commands: [ExportData.make({ data, today })],
      }),
      SucceededExportData: () => ({
        model: { ...model, exportStatus: 'idle', dataSuccess: 'Data exported.' },
      }),
      FailedExportData: ({ message }) => ({
        model: { ...model, exportStatus: 'idle', dataError: message },
      }),
      ClickedSelectImportFile: () => ({
        model: { ...model, importStatus: 'reading', dataError: null, dataSuccess: null },
        commands: [selectImportFile()],
      }),
      SelectedImportFile: ({ file }) => ({ model, commands: [ReadImportFile.make({ file })] }),
      CancelledSelectImportFile: () => ({ model: { ...model, importStatus: 'idle' } }),
      PreparedImportData: ({ data }) => ({
        model: { ...model, importConfirm: data, importStatus: 'confirming' },
      }),
      CancelledImportData: () => ({ model: { ...model, importConfirm: null, importStatus: 'idle' } }),
      ConfirmedImportData: () => {
        if (model.importConfirm === null) {
          return { model }
        }
        const snapshot: JournalSnapshot = {
          ...model.importConfirm,
          data: {
            ...model.importConfirm.data,
            preferences: {
              ...model.importConfirm.data.preferences,
              timezone: model.importConfirm.data.preferences.timezone ?? timezone,
            },
          },
        }
        return {
          model: { ...model, importConfirm: null, importStatus: 'importing' },
          mutation: mutate(
            () => ImportJournal.make({ snapshot }),
            SucceededImportData({ summary: importSummary(snapshot.data) }),
            (message) => FailedImportData({ message })
          ),
        }
      },
      SucceededImportData: ({ summary }) => ({
        model: { ...model, importStatus: 'idle', dataSuccess: `Imported ${summary}.` },
      }),
      FailedImportData: ({ message }) => ({
        model: { ...model, importConfirm: null, importStatus: 'idle', dataError: message },
      }),
    })
  )
