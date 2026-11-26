import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { InjectionId } from '@garage/subq-domain/Journal/Journal.id'
import { LogInjection } from '@garage/subq-domain/Journal/LogInjection.command'
import { DoseMg } from '@garage/subq-domain/Values'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { OpenInjectionForm } from '../src/page/injections/command.ts'
import { CompletedOpenInjectionForm } from '../src/page/injections/model.ts'
import { loadedScene, loaded, schedule } from './journal-fixtures.ts'

it.effect('requires confirmation for a dose outside the assigned schedule', () =>
  Effect.gen(function* () {
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: LogInjection.make({
        injectionId: InjectionId.make('test-session:0'),
        administeredAt: DateTime.makeUnsafe('2026-11-25T17:00:00Z'),
        compound: 'Semaglutide',
        doseMg: DoseMg.make(0.75),
        site: null,
        supplier: null,
        notes: null,
        scheduleId: schedule.id,
      }),
    })
    const scene = yield* loadedScene(loaded('/injection'))
    scene
      .click(HtmlLocator.role('button', { name: 'Add Entry' }))
      .resolve(OpenInjectionForm, CompletedOpenInjectionForm({ log: null, nowLocal: '2026-11-25T12:00' }))
      .change(HtmlLocator.label('Medication *'), 'Semaglutide')
      .change(HtmlLocator.label('Link to Schedule'), schedule.id)
      .type(HtmlLocator.label('Dose (mg) *'), '0.75')
      .expect(Locator.text('Off-schedule dose'))
      .toExist()
      .click(HtmlLocator.role('button', { name: 'Log anyway' }))
      .submit(Locator.tag('form'))
      .expectExact(request)
      .resolve(request, 'saved')
  })
)
