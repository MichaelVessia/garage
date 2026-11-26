import { HtmlLocator } from '@effect/ui/html/testing'
import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import { CalendarDate } from '@garage/subq-domain/Calendar'
import { CompleteGoal } from '@garage/subq-domain/Journal/CompleteGoal.command'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { ApplyPreset } from '../src/page/stats/command.ts'
import { loadedScene, goal, loaded, profile, routeChanged, timezone } from './journal-fixtures.ts'

it.effect('recalculates the Stats range from live data without issuing a request', () =>
  Effect.gen(function* () {
    const scene = yield* loadedScene(loaded())
    scene
      .expect(Locator.text('190.0 lbs'))
      .toExist()
      .click(HtmlLocator.role('button', { name: '1 Month' }))
      .expectExact(ApplyPreset.make({ preset: '1m', timezone }))
      .resolve(ApplyPreset, undefined)
      .subscription('@effect/ui/Router', routeChanged('/stats?start=2026-11-02&end=2026-11-25'))
      .expectExact()
      .expect(Locator.text('No weight data available'))
      .toExist()
      .subscription('@effect/ui/Router', routeChanged('/stats'))
      .expectExact()
      .expect(Locator.text('190.0 lbs'))
      .toExist()
  })
)

it.effect('completes the active goal and removes its controls when the profile changes', () =>
  Effect.gen(function* () {
    const complete = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: CompleteGoal.make({ goalId: goal.id }),
    })
    const scene = yield* loadedScene(loaded())
    scene
      .click(HtmlLocator.role('button', { name: 'Complete Goal' }))
      .expectExact(complete)
      .resolve(complete, 'saved')
      .subscription(
        'profile',
        Shell.ReceivedProfile({
          profile: {
            ...profile,
            goals: { [goal.id]: { ...goal, isActive: false, completedAt: DateTime.makeUnsafe('2026-11-25') } },
          },
        })
      )
      .expect(HtmlLocator.role('button', { name: 'Complete Goal' }))
      .toBeAbsent()
      .expectExact()
  })
)

it.effect('opens the editor with the active goal dates', () =>
  Effect.gen(function* () {
    const scene = yield* loadedScene(loaded())
    scene
      .click(HtmlLocator.role('button', { name: 'Edit' }))
      .expect(HtmlLocator.label('Start Date'))
      .toHaveValue(CalendarDate.make('2026-11-01'))
      .expectExact()
  })
)

it.effect('shows a missing page for malformed dates and uses the last repeated date', () =>
  Effect.gen(function* () {
    const scene = yield* loadedScene(loaded('/stats?start=bad-date'))
    scene
      .expect(Locator.text('Page not found'))
      .toExist()
      .subscription('@effect/ui/Router', routeChanged('/stats?start=bad-date&start=2026-11-02'))
      .expect(Locator.text('No weight data available'))
      .toExist()
  })
)
