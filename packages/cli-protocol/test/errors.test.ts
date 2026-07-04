import { assert, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

import {
  decodeErrorFields,
  envMissingFields,
  httpErrorFields,
  makeDecodeError,
  makeEnvMissing,
  makeHttpError,
  makeUnreachable,
  unreachableFields,
} from '../src/index.js'

// Direct tests for the shared error-builder factories every service package
// wires up into its own four TaggedErrorClasses. Two independent "Foo"/"Bar"
// error families are built here (mirroring how each app package declares its
// own classes) to confirm the factories stay parameterised per class rather
// than leaking state or identity across packages.

class FooEnvMissingError extends Schema.TaggedErrorClass<FooEnvMissingError>()(
  'FooEnvMissingError',
  envMissingFields('FOO_ENV_MISSING')
) {}

class FooUnreachableError extends Schema.TaggedErrorClass<FooUnreachableError>()(
  'FooUnreachableError',
  unreachableFields('FOO_UNREACHABLE')
) {}

class FooHttpError extends Schema.TaggedErrorClass<FooHttpError>()('FooHttpError', httpErrorFields('FOO_HTTP_ERROR')) {}

class FooDecodeError extends Schema.TaggedErrorClass<FooDecodeError>()(
  'FooDecodeError',
  decodeErrorFields('FOO_DECODE_ERROR')
) {}

class BarEnvMissingError extends Schema.TaggedErrorClass<BarEnvMissingError>()(
  'BarEnvMissingError',
  envMissingFields('BAR_ENV_MISSING')
) {}

const fooEnvMissing = makeEnvMissing(FooEnvMissingError, 'FOO_ENV_MISSING', 'Set FOO_URL.')
const fooUnreachable = makeUnreachable(FooUnreachableError, 'FOO_UNREACHABLE', 'Check that Foo is reachable.')
const fooHttpError = makeHttpError(FooHttpError, 'FOO_HTTP_ERROR', 'Foo', 'Check Foo credentials and server logs.')
const fooDecodeError = makeDecodeError(FooDecodeError, 'FOO_DECODE_ERROR', 'Update the Foo schemas.')
const barEnvMissing = makeEnvMissing(BarEnvMissingError, 'BAR_ENV_MISSING', 'Set BAR_URL.')

it('makeEnvMissing builds the exact code/message/fix shape', () => {
  const error = fooEnvMissing('FOO_URL')

  assert.ok(Schema.is(FooEnvMissingError)(error))
  assert.strictEqual(error._tag, 'FooEnvMissingError')
  assert.strictEqual(error.code, 'FOO_ENV_MISSING')
  assert.strictEqual(error.message, 'FOO_URL is not set')
  assert.strictEqual(error.fix, 'Set FOO_URL.')
})

it('makeUnreachable omits cause when none is given and carries it when provided', () => {
  const withoutCause = fooUnreachable('connection refused')
  const cause = new Error('ECONNREFUSED')
  const withCause = fooUnreachable('connection refused', cause)

  assert.strictEqual(withoutCause.code, 'FOO_UNREACHABLE')
  assert.strictEqual(withoutCause.message, 'connection refused')
  assert.strictEqual(withoutCause.fix, 'Check that Foo is reachable.')
  assert.strictEqual(Object.hasOwn(withoutCause, 'cause'), false)
  assert.strictEqual(withCause.cause, cause)
})

it('makeHttpError formats the display-name message and carries the status', () => {
  const error = fooHttpError(503)

  assert.strictEqual(error.code, 'FOO_HTTP_ERROR')
  assert.strictEqual(error.message, 'Foo returned HTTP 503')
  assert.strictEqual(error.fix, 'Check Foo credentials and server logs.')
  assert.strictEqual(error.status, 503)
})

it('makeDecodeError omits cause when none is given and carries it when provided', () => {
  const withoutCause = fooDecodeError('unexpected shape')
  const cause = { message: 'schema mismatch' }
  const withCause = fooDecodeError('unexpected shape', cause)

  assert.strictEqual(withoutCause.code, 'FOO_DECODE_ERROR')
  assert.strictEqual(withoutCause.message, 'unexpected shape')
  assert.strictEqual(Object.hasOwn(withoutCause, 'cause'), false)
  assert.strictEqual(withCause.cause, cause)
})

it('binds each builder to its own class rather than a shared one', () => {
  const foo = fooEnvMissing('FOO_URL')
  const bar = barEnvMissing('BAR_URL')

  assert.ok(Schema.is(FooEnvMissingError)(foo))
  assert.ok(!Schema.is(BarEnvMissingError)(foo))
  assert.ok(Schema.is(BarEnvMissingError)(bar))
  assert.ok(!Schema.is(FooEnvMissingError)(bar))
  assert.strictEqual(foo.code, 'FOO_ENV_MISSING')
  assert.strictEqual(bar.code, 'BAR_ENV_MISSING')
})
