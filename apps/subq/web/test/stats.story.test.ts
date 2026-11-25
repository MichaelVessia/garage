import { it } from '@effect/vitest'
import { CalendarDate } from '@garage/subq-domain/Calendar'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import * as DateTime from 'effect/DateTime'
import { Scene } from 'foldkit'

import { client } from '../src/client.ts'
import { Shell } from '../src/model.ts'
import { ApplyPreset } from '../src/page/stats/command.ts'
import { NavigatedStats } from '../src/page/stats/model.ts'
import { app, goal, loaded, press, profile, receipt, route, shows, timezone } from './journal-fixtures.ts'

it('recalculates the Stats range from live data without issuing a request', () => {
  Scene.scene(
    app,
    Scene.given(loaded()),
    shows('190.0 lbs'),
    press('1 Month'),
    Scene.Command.expectExact(ApplyPreset({ preset: '1m', timezone })),
    Scene.Command.resolve(ApplyPreset, NavigatedStats()),
    route('/stats?start=2026-11-02&end=2026-11-25'),
    Scene.Command.expectNone(),
    shows('No weight data available'),
    route('/stats'),
    Scene.Command.expectNone(),
    shows('190.0 lbs')
  )
})

it('completes the active goal and removes its controls when the profile changes', () => {
  const complete = client.CompleteGoal({ target, commandId: 'test-session:0', input: { goalId: goal.id } })
  Scene.scene(
    app,
    Scene.given(loaded()),
    press('Complete Goal'),
    Scene.Command.expectExact(complete),
    Scene.Command.resolve(
      complete,
      client.Message.SucceededCompleteGoal({ commandId: 'test-session:0', receipt, reply: undefined })
    ),
    Scene.Subscription.emit(
      Shell.ReceivedProfile({
        profile: {
          ...profile,
          goals: { [goal.id]: { ...goal, isActive: false, completedAt: DateTime.makeUnsafe('2026-11-25') } },
        },
      })
    ),
    Scene.expect(Scene.role('button', { name: 'Complete Goal' })).toBeAbsent(),
    Scene.Command.expectNone()
  )
})

it('opens the editor with the active goal dates', () => {
  Scene.scene(
    app,
    Scene.given(loaded()),
    press('Edit'),
    Scene.expect(Scene.label('Start Date')).toHaveValue(CalendarDate.make('2026-11-01')),
    Scene.Command.expectNone()
  )
})
