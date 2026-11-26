import { Locator } from '@effect/ui/testing'
import { it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

import { Shell } from '../src/model.ts'
import { loadedScene, injection, loaded, routeChanged, schedule } from './journal-fixtures.ts'

it.effect('renders assigned injections in their phase and handles a missing schedule without a request', () =>
  Effect.gen(function* () {
    const scene = yield* loadedScene(loaded(`/schedule/${schedule.id}`))
    scene
      .expect(Locator.text('Titration'))
      .toExist()
      .expect(Locator.text('@ Left thigh'))
      .toExist()
      .subscription(
        'injectionHistory',
        Shell.ReceivedInjections({ injections: { [injection.id]: { ...injection, scheduleId: null } } })
      )
      .expect(Locator.text('@ Left thigh'))
      .toBeAbsent()
      .subscription('@effect/ui/Router', routeChanged('/schedule/missing'))
      .expect(Locator.text('Schedule not found.'))
      .toExist()
      .expectExact()
  })
)
