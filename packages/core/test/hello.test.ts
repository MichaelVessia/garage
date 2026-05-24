import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'

import { helloWorld } from '../src/index.js'

it.effect('returns hello world', () =>
  Effect.gen(function* () {
    const message = yield* helloWorld
    assert.strictEqual(message, 'hello world')
  })
)
