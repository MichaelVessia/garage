import { decodeLegacyV3Export, JournalSnapshot, JournalSnapshotJson } from '@garage/subq-domain/ExportFormat'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command, File } from 'foldkit'

import { downloadTextFile } from '../../adapter/browser-download.ts'
import { ImportFileReadError } from '../../errors.ts'
import { toCommandResult } from '../../lib/command.ts'
import {
  CancelledSelectImportFile,
  FailedExportData,
  FailedImportData,
  PreparedImportData,
  SelectedImportFile,
  SucceededExportData,
} from './model.ts'

export const ExportData = Command.define('ExportData', {
  args: { data: JournalSnapshot.fields.data, today: Schema.String },
  messages: [SucceededExportData, FailedExportData],
  execute: ({ data, today }) =>
    Effect.gen(function* () {
      const exportedAt = yield* DateTime.now
      const contents = yield* Schema.encodeEffect(JournalSnapshotJson)({ version: '4.0.0', exportedAt, data })
      yield* downloadTextFile({ contents, filename: `subq-export-${today}.json`, mediaType: 'application/json' })
      return SucceededExportData()
    }).pipe(toCommandResult(FailedExportData, 'Could not export the journal.')),
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
      Effect.flatMap((json) =>
        Schema.decodeEffect(JournalSnapshotJson)(json).pipe(Effect.catch(() => decodeLegacyV3Export(json)))
      ),
      Effect.map((data) => PreparedImportData({ data })),
      toCommandResult(FailedImportData, 'Select a valid SubQ 4.0.0 or 3.0.0-alpha.2 export.')
    ),
})
