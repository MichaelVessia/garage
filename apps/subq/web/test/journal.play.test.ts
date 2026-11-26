import { Router } from '@effect/ui'
import { HtmlLocator, HtmlPlay } from '@effect/ui/html/testing'
import { Locator, TestHost } from '@effect/ui/testing'
import { assert, it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stream from 'effect/Stream'
import * as TestClock from 'effect/testing/TestClock'

import { SubmitJournalCommand } from '../src/client.ts'
import { Subq } from '../src/main.ts'
import { ApplyPreset } from '../src/page/stats/command.ts'
import { AppRoute } from '../src/route.ts'
import { loaded } from './journal-fixtures.ts'

const watch = <State>(state: State) => ({
  watch: (target: typeof PERSONAL_JOURNAL_ID) => {
    assert.strictEqual(target, PERSONAL_JOURNAL_ID)
    return Stream.make({ state, cursor: 0 })
  },
  get: () => Effect.die('Unexpected get'),
  snapshot: () => Effect.die('Unexpected snapshot'),
  list: () => Effect.die('Unexpected list'),
  events: () => Stream.fromEffect(Effect.die('Unexpected events')),
})

it.effect('loads the journal, applies a date preset, and handles an expired save', () =>
  Effect.gen(function* () {
    yield* DateTime.makeUnsafe('2026-12-02T17:00:00Z').pipe(DateTime.toEpochMillis, TestClock.setTime)
    const data = loaded('/stats')
    const client = Layer.mock(SubqApi.Client, {
      JournalProfile: watch(data.profile),
      WeightHistory: watch(data.weights),
      InjectionHistory: watch(data.injectionHistory),
      UpdatePreferences: (target, input, options) =>
        Effect.sync(() => {
          assert.strictEqual(target, PERSONAL_JOURNAL_ID)
          assert.deepStrictEqual(input, { weightUnit: 'kg' })
          assert.strictEqual(options?.commandId, 'test-session:0')
        }).pipe(Effect.andThen(Effect.fail(Unauthorized.make({})))),
    })
    yield* Effect.gen(function* () {
      const router = yield* Router.Router
      const play = yield* HtmlPlay.make(Subq, data.flags)
      yield* play.expect(Locator.text('190.0 lbs')).toExist()
      yield* play.click(HtmlLocator.role('button', { name: '1 Month' }))
      yield* play.expect(Locator.text('No weight data available')).toExist()
      assert.strictEqual(router.location().url, '/stats?start=2026-11-02&end=2026-12-02')

      yield* router.navigate('/settings')
      yield* play.expect(Locator.text('Display Preferences')).toExist()
      yield* play.click(HtmlLocator.role('button', { name: 'Kilograms (kg)' }))
      yield* play.expect(Locator.text('Session expired. Reload to sign in.')).toExist()
      yield* play.expect(HtmlLocator.role('button', { name: 'Reload' })).toExist()
    }).pipe(
      Effect.provide([
        SubmitJournalCommand.layer.pipe(Layer.provideMerge(client)),
        ApplyPreset.layer.pipe(Layer.provideMerge(Router.memory({ routes: AppRoute, url: '/stats' }))),
        TestHost.layer(),
      ])
    )
  })
)
