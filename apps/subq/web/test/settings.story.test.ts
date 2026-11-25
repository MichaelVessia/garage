import { assert, it } from '@effect/vitest'
import { JournalSnapshotJson } from '@garage/subq-domain/ExportFormat'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { ExportData, ReadImportFile, SelectImportFile } from '../src/page/settings/command.ts'
import { SelectedImportFile, SucceededExportData } from '../src/page/settings/model.ts'
import { app, loaded, press, receipt, shows, today, timezone, weight } from './journal-fixtures.ts'

const exportedAt = DateTime.makeUnsafe('2026-11-25T17:00:00Z')
const data = { preferences: { timezone }, weights: [weight], injections: [], schedules: [], goals: [] }
const snapshot = { version: '4.0.0', data, exportedAt } as const

const legacy = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
  version: '3.0.0-alpha.2',
  exportedAt: DateTime.formatIso(exportedAt),
  data: {
    settings: null,
    weightLogs: [
      {
        id: weight.id,
        weight: weight.weightLbs,
        datetime: DateTime.formatIso(weight.recordedAt),
        createdAt: DateTime.formatIso(weight.createdAt),
        updatedAt: DateTime.formatIso(weight.updatedAt),
        notes: null,
      },
    ],
    injectionLogs: [],
    schedules: [],
    goals: [],
  },
})

const importFile = (contents: string) => new File([contents], 'journal.json', { type: 'application/json' })

const importsSnapshot = (contents: string) =>
  Effect.gen(function* () {
    const file = importFile(contents)
    const read = ReadImportFile({ file })
    const prepared = yield* read.effect
    const request = client.ImportJournal({ target, commandId: 'test-session:0', input: { snapshot } })
    Scene.scene(
      app,
      Scene.given(loaded('/settings')),
      press('Import Data'),
      Scene.Command.resolve(SelectImportFile, SelectedImportFile({ file })),
      Scene.Command.resolve(ReadImportFile, prepared),
      shows('1 weight logs, 0 injection logs, 0 schedules, 0 goals'),
      press('Replace All Data'),
      Scene.Command.expectExact(request),
      Scene.Command.resolve(
        request,
        client.Message.SucceededImportJournal({ commandId: 'test-session:0', receipt, reply: undefined })
      ),
      shows('Imported 1 weight logs, 0 injection logs, 0 schedules, 0 goals.'),
      Scene.Command.expectNone()
    )
  })

it.effect('imports version 4 through the file decoder and confirmation screen', () =>
  Schema.encodeEffect(JournalSnapshotJson)(snapshot).pipe(Effect.flatMap(importsSnapshot))
)

it.effect('converts and imports version 3 with the current timezone if the backup lacks one', () =>
  legacy.pipe(Effect.flatMap(importsSnapshot))
)

it.effect('rejects an invalid backup before sending a command', () =>
  Effect.gen(function* () {
    const file = importFile('{"version":"2.0.0"}')
    const result = yield* ReadImportFile({ file }).effect
    assert.strictEqual(result._tag, 'FailedImportData')
    Scene.scene(
      app,
      Scene.given(loaded('/settings')),
      press('Import Data'),
      Scene.Command.resolve(SelectImportFile, SelectedImportFile({ file })),
      Scene.Command.resolve(ReadImportFile, result),
      shows('Select a valid SubQ 4.0.0 or 3.0.0-alpha.2 export.'),
      Scene.Command.expectNone()
    )
  })
)

it('exports the current live snapshot and validates the timezone input', () => {
  Scene.scene(
    app,
    Scene.given({
      ...loaded('/settings'),
      injectionHistory: {},
      profile: {
        ...loaded().profile,
        preferences: { timezone },
        schedules: {},
        goals: {},
        latestWeight: weight,
        lastInjection: null,
        knownSites: [],
      },
    }),
    press('Export Data'),
    Scene.Command.expectExact(ExportData({ data, today })),
    Scene.Command.resolve(ExportData, SucceededExportData()),
    shows('Data exported.'),
    Scene.type(Scene.label('Timezone'), 'Invalid/Zone'),
    Scene.submit('form'),
    shows('Enter a valid IANA timezone, such as America/New_York.'),
    Scene.Command.expectNone()
  )
})
