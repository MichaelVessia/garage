import { it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID as target, WeightId } from '@garage/subq-domain/Journal/Journal.id'
import { Notes, WeightLbs, kgToLbs } from '@garage/subq-domain/Values'
import * as DateTime from 'effect/DateTime'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { OpenWeightForm } from '../src/page/weight/command.ts'
import { CompletedOpenWeightForm } from '../src/page/weight/model.ts'
import { app, loaded, press, profile, receipt, shows, weight } from './journal-fixtures.ts'

const nowLocal = '2026-11-25T12:00'

it('records kilograms in pounds and shows the live entry without a refetch', () => {
  const entry = {
    ...weight,
    id: WeightId.make('test-session:0'),
    weightLbs: WeightLbs.make(kgToLbs(80)),
    recordedAt: DateTime.makeUnsafe('2026-11-25T17:00:00Z'),
  }
  const request = client.RecordWeight({
    target,
    commandId: 'test-session:0',
    input: { weightId: entry.id, recordedAt: entry.recordedAt, weightLbs: entry.weightLbs, notes: null },
  })
  Scene.scene(
    app,
    Scene.given({
      ...loaded('/weight'),
      weights: {},
      profile: { ...profile, preferences: { ...profile.preferences, weightUnit: 'kg' } },
    }),
    press('Add Entry'),
    Scene.Command.resolve(OpenWeightForm, CompletedOpenWeightForm({ log: null, nowLocal })),
    Scene.type(Scene.label('Weight (kg) *'), '80'),
    Scene.submit('form'),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededRecordWeight({ commandId: 'test-session:0', receipt, reply: undefined })
    ),
    Scene.Subscription.emit(Shell.ReceivedWeights({ weights: { [entry.id]: entry } })),
    Scene.Command.expectNone(),
    shows('80.0 kg')
  )
})

it('preserves the precise instant on a note-only correction during the DST overlap', () => {
  const notes = Notes.make('Corrected note')
  const request = client.CorrectWeight({
    target,
    commandId: 'test-session:0',
    input: { weightId: weight.id, recordedAt: weight.recordedAt, weightLbs: weight.weightLbs, notes },
  })
  Scene.scene(
    app,
    Scene.given(loaded('/weight')),
    press('Edit'),
    Scene.Command.resolve(OpenWeightForm, CompletedOpenWeightForm({ log: weight, nowLocal })),
    Scene.type(Scene.label('Notes'), notes),
    Scene.submit('form'),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededCorrectWeight({ commandId: 'test-session:0', receipt, reply: undefined })
    )
  )
})
