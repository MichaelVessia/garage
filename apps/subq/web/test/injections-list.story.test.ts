import { it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { app, injection, loaded, receipt, shows } from './journal-fixtures.ts'

it('writes an assignment change and displays the new value from the live history', () => {
  const request = client.AssignInjectionsToSchedule({
    target,
    commandId: 'test-session:0',
    input: { injectionIds: [injection.id], scheduleId: null },
  })
  const assignment = Scene.role('combobox', { name: 'Assign injection to schedule' })
  Scene.scene(
    app,
    Scene.given(loaded('/injection')),
    shows('Example supplier'),
    Scene.expect(assignment).toHaveValue(injection.scheduleId ?? ''),
    Scene.change(assignment, ''),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededAssignInjectionsToSchedule({ commandId: 'test-session:0', receipt, reply: undefined })
    ),
    Scene.Subscription.emit(
      Shell.ReceivedInjections({ injections: { [injection.id]: { ...injection, scheduleId: null } } })
    ),
    Scene.expect(assignment).toHaveValue(''),
    Scene.Command.expectNone()
  )
})
