import { it } from '@effect/vitest'
import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { PERSONAL_JOURNAL_ID as target } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import * as Schema from 'effect/Schema'
import { Scene } from 'foldkit'
import { Command, given, message, story } from 'foldkit/story'

import { client } from '../src/client.ts'
import { update } from '../src/main.ts'
import { Shell } from '../src/model.ts'
import { ClickedSettingsWeightUnit } from '../src/page/settings/model.ts'
import { app, initial, loaded, profile, receipt, shows, timezone } from './journal-fixtures.ts'

it('initializes an absent timezone once when the first profile arrives', () => {
  const receive = Shell.ReceivedProfile({ profile: null })
  const bootstrap = client.UpdatePreferences({ target, commandId: 'test-session:0', input: { timezone } })
  story(
    update,
    given(initial()),
    message(receive),
    Command.expectExact(bootstrap),
    Command.resolve(
      bootstrap,
      client.Message.SucceededUpdatePreferences({ commandId: 'test-session:0', receipt, reply: undefined })
    ),
    message(receive),
    Command.expectNone(),
    message(Shell.ReceivedProfile({ profile })),
    Command.expectNone()
  )
})

it('keeps the stored timezone and opens Stats after the three live views arrive', () => {
  Scene.scene(
    app,
    Scene.given(initial()),
    shows('Loading journal...'),
    Scene.Subscription.emit(
      Shell.ReceivedProfile({
        profile: { ...profile, preferences: { timezone: IanaTimezone.make('Pacific/Auckland') } },
      })
    ),
    Scene.Subscription.emit(Shell.ReceivedWeights({ weights: {} })),
    Scene.Subscription.emit(Shell.ReceivedInjections({ injections: {} })),
    Scene.Command.expectNone(),
    shows('Weight Statistics'),
    shows('Goal Progress')
  )
})

it('asks the user to reload when a live read reports an expired session', () => {
  Scene.scene(
    app,
    Scene.given(initial('/weight')),
    Scene.Subscription.emit(Shell.SessionExpired()),
    shows('Session expired. Reload to sign in.'),
    Scene.expect(Scene.role('button', { name: 'Reload' })).toExist(),
    Scene.Command.expectNone()
  )
})

it('asks the user to reload when the server denies a command', () => {
  const denied = Schema.TaggedStruct('Denied', { error: Unauthorized })
  const request = client.UpdatePreferences({ target, commandId: 'test-session:0', input: { weightUnit: 'kg' } })
  story(
    update,
    given(loaded('/settings')),
    message(ClickedSettingsWeightUnit({ unit: 'kg' })),
    Command.expectExact(request),
    Command.resolve(
      request,
      client.Message.FailedUpdatePreferences({
        commandId: 'test-session:0',
        failure: denied.make({ error: Unauthorized.make({}) }),
      })
    ),
    message(ClickedSettingsWeightUnit({ unit: 'kg' })),
    Command.expectNone()
  )
})
