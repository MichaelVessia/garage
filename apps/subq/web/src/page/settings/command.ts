import { Command } from '@effect/ui'
import { HtmlFiles } from '@effect/ui/html'
import { decodeLegacyV3Export, JournalSnapshot, JournalSnapshotJson } from '@garage/subq-domain/ExportFormat'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { downloadTextFile } from '../../adapter/browser-download.ts'
import { toCommandResult } from '../../lib/command.ts'
import {
  CancelledSelectImportFile,
  FailedExportData,
  FailedImportData,
  PreparedImportData,
  SelectedImportFile,
  SucceededExportData,
} from './model.ts'

export const ExportData = Command.make(
  'ExportData',
  { args: { data: JournalSnapshot.fields.data, today: Schema.String } },
  ({ data, today }) =>
    Effect.gen(function* () {
      const exportedAt = yield* DateTime.now
      const contents = yield* Schema.encodeEffect(JournalSnapshotJson)({ version: '4.0.0', exportedAt, data })
      yield* downloadTextFile({ contents, filename: `subq-export-${today}.json`, mediaType: 'application/json' })
      return SucceededExportData()
    }).pipe(toCommandResult(FailedExportData, 'Could not export the journal.'))
)

export const selectImportFile = () =>
  HtmlFiles.pick(
    ({ files: [file] }) => (file === undefined ? CancelledSelectImportFile() : SelectedImportFile({ file })),
    { accept: ['.json', 'application/json'] }
  )

export const ReadImportFile = Command.make('ReadImportFile', { args: { file: Schema.instanceOf(File) } }, ({ file }) =>
  HtmlFiles.readAsText(file).pipe(
    Effect.flatMap((json) =>
      Schema.decodeEffect(JournalSnapshotJson)(json).pipe(Effect.catch(() => decodeLegacyV3Export(json)))
    ),
    Effect.map((data) => PreparedImportData({ data })),
    toCommandResult(FailedImportData, 'Select a valid SubQ 4.0.0 or 3.0.0-alpha.2 export.')
  )
)
