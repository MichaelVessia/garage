import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { makePromptStash } from '../src/prompt-stash.js'

describe('prompt-stash session state', () => {
  it.effect('stashes a prompt and restores it once', () =>
    Effect.gen(function* () {
      const stash = makePromptStash()

      const stashed = yield* stash.toggle('first prompt')
      const restored = yield* stash.toggle('')
      const empty = yield* stash.toggle('')

      assert.deepStrictEqual(stashed, { _tag: 'Stashed' })
      assert.deepStrictEqual(restored, { _tag: 'Restored', prompt: 'first prompt' })
      assert.deepStrictEqual(empty, { _tag: 'Empty' })
    })
  )

  it.effect('lets interactive submission restore and clear the stash directly', () =>
    Effect.gen(function* () {
      const stash = makePromptStash()

      yield* stash.toggle('original prompt')
      const restored = yield* stash.restore
      const cleared = yield* stash.restore

      assert.deepStrictEqual(restored, Option.some('original prompt'))
      assert.deepStrictEqual(cleared, Option.none())
    })
  )

  it.effect('replaces the stash when another non-empty prompt is stashed', () =>
    Effect.gen(function* () {
      const stash = makePromptStash()

      yield* stash.toggle('first prompt')
      yield* stash.toggle('replacement prompt')
      const restored = yield* stash.restore

      assert.deepStrictEqual(restored, Option.some('replacement prompt'))
    })
  )
})
