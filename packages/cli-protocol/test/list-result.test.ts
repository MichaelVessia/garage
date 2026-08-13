import { assert, it } from '@effect/vitest'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { JsonObject, ListResultSchema, listResult } from '../src/index.js'

// Direct tests for the shared list/record shapes every service package's
// list endpoints and dynamic-JSON passthroughs (e.g. `dnsConfig`) build on.

const RecordSchema = ListResultSchema(Schema.String)

it('ListResultSchema decodes a matching count/records shape', () => {
  const decoded = Schema.decodeUnknownSync(RecordSchema)({ count: 2, records: ['a', 'b'] })
  assert.deepStrictEqual(decoded, { count: 2, records: ['a', 'b'] })
})

it('ListResultSchema fails to decode a shape with the wrong field types', () => {
  const result = Schema.decodeUnknownResult(RecordSchema)({ count: 'two', records: ['a'] })
  assert.strictEqual(Result.isFailure(result), true)
})

it('listResult derives the count from the given records', () => {
  assert.deepStrictEqual(listResult(['a', 'b', 'c']), { count: 3, records: ['a', 'b', 'c'] })
  assert.deepStrictEqual(listResult([]), { count: 0, records: [] })
})

it('JsonObject decodes recursive JSON objects and arrays', () => {
  const decoded = Schema.decodeUnknownSync(JsonObject)({
    a: 1,
    b: ['x', { nested: true }],
    c: null,
  })
  assert.deepStrictEqual(decoded, { a: 1, b: ['x', { nested: true }], c: null })
})

it('JsonObject rejects non-record and non-JSON values', () => {
  assert.strictEqual(Result.isFailure(Schema.decodeUnknownResult(JsonObject)(42)), true)
  assert.strictEqual(Result.isFailure(Schema.decodeUnknownResult(JsonObject)({ value: 10n })), true)
  assert.strictEqual(Result.isFailure(Schema.decodeUnknownResult(JsonObject)({ value: () => 'not-json' })), true)
})
