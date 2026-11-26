import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { ReviseSchedule } from '@garage/subq-domain/Journal/ReviseSchedule.command'
import { ScheduleName } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { OpenScheduleForm } from '../src/page/schedule/command.ts'
import { CompletedOpenScheduleForm } from '../src/page/schedule/model.ts'
import { loadedScene, loaded, schedule, today } from './journal-fixtures.ts'

it.effect('keeps phase IDs when updating the schedule name', () =>
  Effect.gen(function* () {
    const name = ScheduleName.make('New name')
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: ReviseSchedule.make({
        scheduleId: schedule.id,
        name,
        compound: schedule.compound,
        notes: null,
        supplier: schedule.supplier,
        frequency: schedule.frequency,
        startDate: schedule.startDate,
        phases: Arr.map(schedule.phases, ({ id, doseMg, durationDays, order }) => ({
          id,
          doseMg,
          durationDays,
          order,
        })),
      }),
    })
    const scene = yield* loadedScene(loaded('/schedule'))
    scene
      .click(HtmlLocator.role('button', { name: 'Edit' }))
      .resolve(OpenScheduleForm, CompletedOpenScheduleForm({ schedule, todayLocal: today }))
      .type(HtmlLocator.label('Schedule Name *'), name)
      .submit(Locator.tag('form'))
      .expectExact(request)
      .resolve(request, 'saved')
  })
)
