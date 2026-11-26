import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { CorrectWeight } from '@garage/subq-domain/Journal/CorrectWeight.command'
import { WeightId } from '@garage/subq-domain/Journal/Journal.id'
import { RecordWeight } from '@garage/subq-domain/Journal/RecordWeight.command'
import { Notes, WeightLbs, kgToLbs } from '@garage/subq-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { OpenWeightForm } from '../src/page/weight/command.ts'
import { CompletedOpenWeightForm } from '../src/page/weight/model.ts'
import { loadedScene, loaded, profile, weight } from './journal-fixtures.ts'

const nowLocal = '2026-11-25T12:00'

it.effect('records kilograms in pounds and shows the live entry without a refetch', () =>
  Effect.gen(function* () {
    const entry = {
      ...weight,
      id: WeightId.make('test-session:0'),
      weightLbs: WeightLbs.make(kgToLbs(80)),
      recordedAt: DateTime.makeUnsafe('2026-11-25T17:00:00Z'),
    }
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: RecordWeight.make({
        weightId: entry.id,
        recordedAt: entry.recordedAt,
        weightLbs: entry.weightLbs,
        notes: null,
      }),
    })
    const scene = yield* loadedScene({
      ...loaded('/weight'),
      weights: {},
      profile: { ...profile, preferences: { ...profile.preferences, weightUnit: 'kg' } },
    })
    scene
      .click(HtmlLocator.role('button', { name: 'Add Entry' }))
      .resolve(OpenWeightForm, CompletedOpenWeightForm({ log: null, nowLocal }))
      .type(HtmlLocator.label('Weight (kg) *'), '80')
      .submit(Locator.tag('form'))
      .expectExact(request)
      .resolve(request, 'saved')
      .subscription('weights', Shell.ReceivedWeights({ weights: { [entry.id]: entry } }))
      .expectExact()
      .expect(Locator.text('80.0 kg'))
      .toExist()
  })
)

it.effect('preserves the precise instant on a note-only correction during the DST overlap', () =>
  Effect.gen(function* () {
    const notes = Notes.make('Corrected note')
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: CorrectWeight.make({
        weightId: weight.id,
        recordedAt: weight.recordedAt,
        weightLbs: weight.weightLbs,
        notes,
      }),
    })
    const scene = yield* loadedScene(loaded('/weight'))
    scene
      .click(HtmlLocator.role('button', { name: 'Edit' }))
      .resolve(OpenWeightForm, CompletedOpenWeightForm({ log: weight, nowLocal }))
      .type(HtmlLocator.label('Notes'), notes)
      .submit(Locator.tag('form'))
      .expectExact(request)
      .resolve(request, 'saved')
  })
)
