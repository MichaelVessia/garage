import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'

import { makeConfigReaders } from '../src/index.js'

// Direct tests for the shared Config reader factory every service package's
// `Config.get()` builds on: missing/empty env maps to the caller's own
// envMissing error, present env decodes to a plain string or a Redacted
// secret.

interface TestEnvMissingError {
  readonly _tag: 'TestEnvMissing'
  readonly variable: string
}

const envMissing = (variable: string): TestEnvMissingError => ({ _tag: 'TestEnvMissing', variable })

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

const withEnv = <A, E>(effect: Effect.Effect<A, E>, env: Readonly<Record<string, string>>): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))))

it.effect('readRequiredString returns the configured value', () =>
  Effect.gen(function* () {
    const value = yield* withEnv(readRequiredString('MY_VAR'), { MY_VAR: 'hello' })
    assert.strictEqual(value, 'hello')
  })
)

it.effect('readRequiredString fails with the caller envMissing error when unset', () =>
  Effect.gen(function* () {
    const error = yield* withEnv(readRequiredString('MY_VAR'), {}).pipe(Effect.flip)
    assert.deepStrictEqual(error, envMissing('MY_VAR'))
  })
)

it.effect('readRequiredString treats an empty value as missing', () =>
  Effect.gen(function* () {
    const error = yield* withEnv(readRequiredString('MY_VAR'), { MY_VAR: '' }).pipe(Effect.flip)
    assert.deepStrictEqual(error, envMissing('MY_VAR'))
  })
)

it.effect('readRequiredSecret returns a Redacted value that hides the raw secret', () =>
  Effect.gen(function* () {
    const secret = yield* withEnv(readRequiredSecret('MY_SECRET'), { MY_SECRET: 'shh' })
    assert.strictEqual(Redacted.isRedacted(secret), true)
    assert.strictEqual(Redacted.value(secret), 'shh')
  })
)

it.effect('readRequiredSecret fails with the caller envMissing error when unset', () =>
  Effect.gen(function* () {
    const error = yield* withEnv(readRequiredSecret('MY_SECRET'), {}).pipe(Effect.flip)
    assert.deepStrictEqual(error, envMissing('MY_SECRET'))
  })
)
