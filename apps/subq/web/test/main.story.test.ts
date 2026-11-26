import { HtmlLocator, HtmlScene } from '@effect/ui/html/testing'
import { Locator, Story } from '@effect/ui/testing'
import { assert, it } from '@effect/vitest'
import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { UpdatePreferences } from '@garage/subq-domain/Journal/UpdatePreferences.command'
import * as Effect from 'effect/Effect'

import { SubmitJournalCommand } from '../src/client.ts'
import { Subq } from '../src/main.ts'
import { Shell } from '../src/model.ts'
import { ClickedSettingsWeightUnit } from '../src/page/settings/model.ts'
import { flags, loaded, profile, timezone } from './journal-fixtures.ts'

it.effect('initializes an absent timezone once when the first profile arrives', () =>
  Effect.gen(function* () {
    const receive = Shell.ReceivedProfile({ profile: null })
    const bootstrap = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: UpdatePreferences.make({ timezone }),
    })
    const story = yield* Story.make(Subq, flags())
    story
      .subscription('profile', receive)
      .expectExact(bootstrap)
      .resolve(bootstrap, 'saved')
      .subscription('profile', receive)
      .expectExact()
      .subscription('profile', Shell.ReceivedProfile({ profile }))
      .expectExact()
  })
)

it.effect('keeps the stored timezone and opens Stats after the three live views arrive', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Subq, flags())
    scene
      .expect(Locator.text('Loading journal...'))
      .toExist()
      .subscription(
        'profile',
        Shell.ReceivedProfile({
          profile: { ...profile, preferences: { timezone: IanaTimezone.make('Pacific/Auckland') } },
        })
      )
      .subscription('weights', Shell.ReceivedWeights({ weights: {} }))
      .subscription('injectionHistory', Shell.ReceivedInjections({ injections: {} }))
      .expectExact()
      .expect(Locator.text('Weight Statistics'))
      .toExist()
      .expect(Locator.text('Goal Progress'))
      .toExist()
  })
)

it.effect('asks the user to reload when a live read reports an expired session', () =>
  Effect.gen(function* () {
    const scene = yield* HtmlScene.make(Subq, flags('/weight'))
    scene
      .subscription('profile', Shell.SessionExpired())
      .expect(Locator.text('Session expired. Reload to sign in.'))
      .toExist()
      .expect(HtmlLocator.role('button', { name: 'Reload' }))
      .toExist()
      .expectExact()
  })
)

it.effect('asks the user to reload when the server denies a command', () =>
  Effect.gen(function* () {
    const data = loaded('/settings')
    const request = SubmitJournalCommand.make({
      commandId: 'test-session:0',
      command: UpdatePreferences.make({ weightUnit: 'kg' }),
    })
    const story = yield* Story.make(Subq, data.flags)
    story
      .subscription('profile', Shell.ReceivedProfile({ profile: data.profile }))
      .subscription('weights', Shell.ReceivedWeights({ weights: data.weights }))
      .subscription('injectionHistory', Shell.ReceivedInjections({ injections: data.injectionHistory }))
      .send(ClickedSettingsWeightUnit({ unit: 'kg' }))
      .expectExact(request)
      .resolve(request, 'expired')
      .send(ClickedSettingsWeightUnit({ unit: 'kg' }))
      .expectExact()
    assert.isTrue(story.model.sessionExpired)
  })
)
