import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { AssignInjectionsToSchedule } from '@garage/subq-domain/Journal/AssignInjectionsToSchedule.command'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { loadedScene, injection, loaded } from './journal-fixtures.ts'

it.effect('writes an assignment change and displays the new value from the live history', () =>
  Effect.gen(function* () {
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: AssignInjectionsToSchedule.make({ injectionIds: [injection.id], scheduleId: null }),
    })
    const assignment = HtmlLocator.role('combobox', { name: 'Assign injection to schedule' })
    const scene = yield* loadedScene(loaded('/injection'))
    scene
      .expect(Locator.text('Example supplier'))
      .toExist()
      .expect(assignment)
      .toHaveValue(injection.scheduleId ?? '')
      .change(assignment, '')
      .expectExact(request)
      .resolve(request, 'saved')
      .subscription(
        'injectionHistory',
        Shell.ReceivedInjections({ injections: { [injection.id]: { ...injection, scheduleId: null } } })
      )
      .expect(assignment)
      .toHaveValue('')
      .expectExact()
  })
)
