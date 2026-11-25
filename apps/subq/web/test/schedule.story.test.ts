import { it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { app, loaded, press, profile, receipt, schedule, shows } from './journal-fixtures.ts'

it('shows the next phase dose and deactivates the schedule through the journal', () => {
  const request = client.DeactivateSchedule({ target, commandId: 'test-session:0', input: { scheduleId: schedule.id } })
  Scene.scene(
    app,
    Scene.given(loaded('/schedule')),
    shows('Phase 2/2'),
    press('Deactivate'),
    Scene.Command.expectExact(request),
    Scene.Command.resolve(
      request,
      client.Message.SucceededDeactivateSchedule({ commandId: 'test-session:0', receipt, reply: undefined })
    ),
    Scene.Subscription.emit(
      Shell.ReceivedProfile({ profile: { ...profile, schedules: { [schedule.id]: { ...schedule, isActive: false } } } })
    ),
    Scene.expect(Scene.text('Phase 2/2')).toBeAbsent(),
    Scene.expect(Scene.role('button', { name: 'Activate' })).toExist(),
    Scene.Command.expectNone()
  )
})
