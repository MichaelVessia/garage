import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent'
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

const extensionPaths = [
  new URL('../extensions/gpt-fast-mode.ts', import.meta.url).pathname,
  new URL('../extensions/prompt-stash.ts', import.meta.url).pathname,
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
      const promptStash = loaded.extensions.find(({ path }) => path.endsWith('prompt-stash.ts'))

      if (fastMode === undefined || promptStash === undefined) {
        return assert.fail('expected both Garage Pi extension adapters to load')
      }

      assert.isTrue(fastMode.commands.has('fast'))
      assert.isTrue(fastMode.shortcuts.has('ctrl+alt+m'))
      assert.deepStrictEqual([...fastMode.handlers.keys()].toSorted(), [
        'before_provider_request',
        'model_select',
        'session_start',
      ])
      assert.deepStrictEqual([...promptStash.handlers.keys()].toSorted(), ['input', 'session_start'])
    })
  )
})
