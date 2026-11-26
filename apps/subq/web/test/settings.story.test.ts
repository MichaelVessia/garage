import { HtmlFiles } from '@effect/ui/html'
import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { assert, it } from '@effect/vitest'
import { JournalSnapshotJson } from '@garage/subq-domain/ExportFormat'
import { ImportJournal } from '@garage/subq-domain/Journal/ImportJournal.command'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { SubmitJournalCommand } from '../src/client.ts'
import { ExportData, ReadImportFile } from '../src/page/settings/command.ts'
import { SucceededExportData } from '../src/page/settings/model.ts'
import { loadedScene, loaded, today, timezone, weight } from './journal-fixtures.ts'

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
    const read = ReadImportFile.make({ file })
    const prepared = yield* read.effect
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: ImportJournal.make({ snapshot }),
    })
    const scene = yield* loadedScene(loaded('/settings'))
    scene
      .click(HtmlLocator.role('button', { name: 'Import Data' }))
      .resolve(HtmlFiles.Pick, { opened: true, files: [file] })
      .resolve(ReadImportFile, prepared)
      .expect(Locator.text('1 weight logs, 0 injection logs, 0 schedules, 0 goals'))
      .toExist()
      .click(HtmlLocator.role('button', { name: 'Replace All Data' }))
      .expectExact(request)
      .resolve(request, 'saved')
      .expect(Locator.text('Imported 1 weight logs, 0 injection logs, 0 schedules, 0 goals.'))
      .toExist()
      .expectExact()
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
    const result = yield* ReadImportFile.make({ file }).effect
    assert.strictEqual(result._tag, 'FailedImportData')
    const scene = yield* loadedScene(loaded('/settings'))
    scene
      .click(HtmlLocator.role('button', { name: 'Import Data' }))
      .resolve(HtmlFiles.Pick, { opened: true, files: [file] })
      .resolve(ReadImportFile, result)
      .expect(Locator.text('Select a valid SubQ 4.0.0 or 3.0.0-alpha.2 export.'))
      .toExist()
      .expectExact()
  })
)

it.effect('exports the current live snapshot and validates the timezone input', () =>
  Effect.gen(function* () {
    const scene = yield* loadedScene({
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
    })
    scene
      .click(HtmlLocator.role('button', { name: 'Export Data' }))
      .expectExact(ExportData.make({ data, today }))
      .resolve(ExportData, SucceededExportData())
      .expect(Locator.text('Data exported.'))
      .toExist()
      .type(HtmlLocator.label('Timezone'), 'Invalid/Zone')
      .submit(Locator.tag('form'))
      .expect(Locator.text('Enter a valid IANA timezone, such as America/New_York.'))
      .toExist()
      .expectExact()
  })
)
