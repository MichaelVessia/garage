import { it } from '@effect/vitest'
import { InjectionId, PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import { DoseMg } from '@garage/subq-domain/Values'
import * as DateTime from 'effect/DateTime'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { OpenInjectionForm } from '../src/page/injections/command.ts'
import { CompletedOpenInjectionForm } from '../src/page/injections/model.ts'
import { app, loaded, press, receipt, schedule, shows } from './journal-fixtures.ts'

it('requires confirmation for a dose outside the assigned schedule', () => {
  const request = client.LogInjection({
    target,
    commandId: 'test-session:0',
    input: {
      injectionId: InjectionId.make('test-session:0'),
      administeredAt: DateTime.makeUnsafe('2026-11-25T17:00:00Z'),
      compound: 'Semaglutide',
      doseMg: DoseMg.make(0.75),
      site: null,
      supplier: null,
      notes: null,
      scheduleId: schedule.id,
    },
  })
  Scene.scene(
    app,
    Scene.given(loaded('/injection')),
    press('Add Entry'),
    Scene.Command.resolve(OpenInjectionForm, CompletedOpenInjectionForm({ log: null, nowLocal: '2026-11-25T12:00' })),
    Scene.change(Scene.label('Medication *'), 'Semaglutide'),
    Scene.change(Scene.label('Link to Schedule'), schedule.id),
    Scene.type(Scene.label('Dose (mg) *'), '0.75'),
    shows('Off-schedule dose'),
    press('Log anyway'),
    Scene.submit('form'),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededLogInjection({ commandId: 'test-session:0', receipt, reply: undefined })
    )
  )
})
