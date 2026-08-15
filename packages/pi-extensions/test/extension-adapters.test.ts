import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent'
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

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

      const fastMode = loaded.extensions.find(({ path }) => path.endsWith('gpt-fast-mode.ts'))
      const sessionModelDefault = loaded.extensions.find(({ path }) => path.endsWith('session-model-default.ts'))

      if (fastMode === undefined || sessionModelDefault === undefined) {
        return assert.fail('expected all Garage Pi extension adapters to load')
      }

      assert.isTrue(fastMode.commands.has('fast'))
      assert.isTrue(fastMode.shortcuts.has('ctrl+alt+m'))
      assert.deepStrictEqual([...fastMode.handlers.keys()].toSorted(), [
        'before_provider_request',
        'model_select',
        'session_start',
      ])
      assert.deepStrictEqual([...sessionModelDefault.handlers.keys()].toSorted(), ['model_select', 'session_start'])
    })
  )
})
