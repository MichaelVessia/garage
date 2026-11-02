import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent'
import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Str from 'effect/String'

const extensionPaths = [
  new URL('../extensions/gpt-fast-mode.ts', import.meta.url).pathname,
  new URL('../extensions/session-model-default.ts', import.meta.url).pathname,
]

const loadAdapters = Effect.tryPromise(() =>
  discoverAndLoadExtensions(extensionPaths, '.', '/tmp/garage-pi-extensions-empty-agent-dir')
)

describe('Pi extension adapters', () => {
  it.effect('load and register their Pi lifecycle surfaces', () =>
    Effect.gen(function* () {
      const loaded = yield* loadAdapters
      assert.deepStrictEqual(loaded.errors, [])
      assert.strictEqual(loaded.extensions.length, 2)

      const fastMode = Arr.findFirst(loaded.extensions, ({ path }) => Str.endsWith('gpt-fast-mode.ts')(path))

      const sessionModelDefault = Arr.findFirst(loaded.extensions, ({ path }) =>
        Str.endsWith('session-model-default.ts')(path)
      )

      if (Option.isNone(fastMode) || Option.isNone(sessionModelDefault)) {
        return assert.fail('expected all Garage Pi extension adapters to load')
      }

      assert.isTrue(fastMode.value.commands.has('fast'))
      assert.isTrue(fastMode.value.shortcuts.has('ctrl+alt+m'))
      assert.deepStrictEqual(Arr.sort(fastMode.value.handlers.keys(), Order.String), [
        'before_provider_request',
        'model_select',
        'session_start',
      ])
      assert.deepStrictEqual(Arr.sort(sessionModelDefault.value.handlers.keys(), Order.String), [
        'model_select',
        'session_start',
      ])
    })
  )
})
