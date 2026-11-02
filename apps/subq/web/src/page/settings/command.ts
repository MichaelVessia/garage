import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { Command, File } from 'foldkit'

import { DataExport, DataExportTemporalMigrationRequired, IanaTimezone, UserSettingsUpdate } from '#shared'

import { downloadTextFile } from '../../adapter/browser-download.js'
import { Api } from '../../api.js'
import { ImportFileReadError } from '../../errors.js'
import { toCommandResult } from '../../lib/command.js'
import {
  CancelledSelectImportFile,
  FailedExportData,
  FailedImportData,
  FailedUpdateSettingsPreference,
  PreparedImportData,
  SelectedImportFile,
  SucceededExportData,
  SucceededImportData,
  SucceededUpdateSettingsPreference,
} from './model.js'

// ============================================
// Commands
// ============================================

const DataExportJson = Schema.fromJsonString(DataExport)

export const UpdateWeightUnit = Command.define('UpdateSettingsWeightUnit', {
  args: { unit: Schema.Literals(['lbs', 'kg']) },
  messages: [SucceededUpdateSettingsPreference, FailedUpdateSettingsPreference],
  execute: ({ unit }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.UserSettingsUpdate(UserSettingsUpdate.make({ weightUnit: unit }))

      return SucceededUpdateSettingsPreference()
    }).pipe(toCommandResult(FailedUpdateSettingsPreference, 'Failed to update display preferences')),
})

export const UpdateTimezone = Command.define('UpdateSettingsTimezone', {
  args: { timezone: IanaTimezone },
  messages: [SucceededUpdateSettingsPreference, FailedUpdateSettingsPreference],
  execute: ({ timezone }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.UserSettingsUpdate(UserSettingsUpdate.make({ timezone }))

      return SucceededUpdateSettingsPreference()
    }).pipe(toCommandResult(FailedUpdateSettingsPreference, 'Failed to update timezone')),
})

export const ExportData = Command.define('ExportData', {
  messages: [SucceededExportData, FailedExportData],
  execute: Effect.gen(function* () {
    const result = yield* Effect.gen(function* () {
      const api = yield* Api
      const data = yield* api.UserDataExport()
      const json = yield* Schema.encodeEffect(DataExportJson)(data)
      const now = yield* DateTime.now
      const filename = `subq-export-${now.pipe(DateTime.formatIso, Str.slice(0, 10))}.json`
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

export const SelectImportFile = Command.define('SelectImportFile', {
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

export const ReadImportFile = Command.define('ReadImportFile', {
  args: { file: File.File },
  messages: [PreparedImportData, FailedImportData],
  execute: ({ file }) =>
    Effect.tryPromise({
      try: () => file.text(),
      catch: () => ImportFileReadError.make({ message: 'Import file could not be read' }),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DataExportJson)),
      Effect.map((data) => PreparedImportData({ data })),
      toCommandResult(FailedImportData, 'Invalid export file. Only Subq 3.0.0-alpha.2 exports are supported.')
    ),
})

export const ImportData = Command.define('ImportData', {
  args: { data: DataExport },
  messages: [SucceededImportData, FailedImportData],
  execute: ({ data }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const result = yield* api.UserDataImport(data)

      return SucceededImportData({ result })
    }).pipe(toCommandResult(FailedImportData, 'Failed to import data. Please try again.')),
})
