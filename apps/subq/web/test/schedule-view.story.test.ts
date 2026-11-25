import { it } from '@effect/vitest'
import { Scene } from 'foldkit'

import { Shell } from '../src/model.ts'
import { app, injection, loaded, route, schedule, shows } from './journal-fixtures.ts'

it('renders assigned injections in their phase and handles a missing schedule without a request', () => {
  Scene.scene(
    app,
    Scene.given(loaded(`/schedule/${schedule.id}`)),
    shows('Titration'),
    shows('@ Left thigh'),
    Scene.Subscription.emit(
      Shell.ReceivedInjections({ injections: { [injection.id]: { ...injection, scheduleId: null } } })
    ),
    Scene.expect(Scene.text('@ Left thigh')).toBeAbsent(),
    route('/schedule/missing'),
    shows('Schedule not found.'),
    Scene.Command.expectNone()
  )
})
