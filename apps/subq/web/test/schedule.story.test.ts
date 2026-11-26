import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { DeactivateSchedule } from '@garage/subq-domain/Journal/DeactivateSchedule.command'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { loadedScene, loaded, profile, schedule } from './journal-fixtures.ts'

it.effect('shows the next phase dose and deactivates the schedule through the journal', () =>
  Effect.gen(function* () {
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: DeactivateSchedule.make({ scheduleId: schedule.id }),
    })
    const scene = yield* loadedScene(loaded('/schedule'))
    scene
      .expect(Locator.text('Phase 2/2'))
      .toExist()
      .click(HtmlLocator.role('button', { name: 'Deactivate' }))
      .expectExact(request)
      .resolve(request, 'saved')
      .subscription(
        'profile',
        Shell.ReceivedProfile({
          profile: { ...profile, schedules: { [schedule.id]: { ...schedule, isActive: false } } },
        })
      )
      .expect(Locator.text('Phase 2/2'))
      .toBeAbsent()
      .expect(HtmlLocator.role('button', { name: 'Activate' }))
      .toExist()
      .expectExact()
  })
)
