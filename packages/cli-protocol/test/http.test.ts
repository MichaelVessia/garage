import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import { Headers, HttpClient, HttpClientError, HttpClientRequest } from 'effect/unstable/http'

import { makeJsonClient } from '../src/index.js'
import type { JsonClientErrors } from '../src/index.js'
import { makeRecordingHttpClient } from '../src/testing.js'

// Direct tests for the shared HTTP-adapter pipeline: URL building, auth
// application, request-body encoding, and the transport/status/decode error
// mapping every service package's JsonClient relies on.

type TestError =
  | { readonly kind: 'unreachable'; readonly message: string; readonly cause?: unknown }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'decode'; readonly message: string; readonly cause?: unknown }

const testErrors: JsonClientErrors<TestError> = {
  httpError: (status) => ({ kind: 'http', status }),
  unreachable: (message, cause) => ({ kind: 'unreachable', message, ...(cause === undefined ? {} : { cause }) }),
  decodeError: (message, cause) => ({ kind: 'decode', message, ...(cause === undefined ? {} : { cause }) }),
}

const ItemSchema = Schema.Struct({ name: Schema.String })

const clientFrom = (respond: Parameters<typeof makeRecordingHttpClient>[0]) =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(respond)
    const client = yield* HttpClient.HttpClient.pipe(Effect.provide(fake.layer))
    return { client, requests: fake.requests }
  })

const authHeaderOf = (raw: HttpClientRequest.HttpClientRequest): string | undefined =>
  Headers.get(raw.headers, 'x-test-auth').pipe(Option.getOrUndefined)

const transportFailureClient = HttpClient.make((request) =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request,
        cause: new Error('ECONNREFUSED'),
        description: 'connection refused',
      }),
    })
  )
)

it.effect('joins baseUrl, basePath, static query, and per-call query into an encoded URL', () =>
  Effect.gen(function* () {
    const { client, requests } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://x.test/',
      basePath: '/api',
      staticQuery: [['token', 'abc']],
      applyAuth: (request) => request,
      errors: testErrors,
    })

    yield* jsonClient.getJson('/foo/bar', ItemSchema, [
      ['q', 'hello world'],
      ['n', 5],
      ['b', true],
    ])

    assert.deepStrictEqual(
      (yield* Ref.get(requests)).map((request) => request.url),
      ['http://x.test/api/foo/bar?token=abc&q=hello%20world&n=5&b=true']
    )
  })
)

it.effect('omits the query string entirely when there are no query params', () =>
  Effect.gen(function* () {
    const { client, requests } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://y.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    yield* jsonClient.getJson('/ping', ItemSchema)

    assert.deepStrictEqual(
      (yield* Ref.get(requests)).map((request) => request.url),
      ['http://y.test/ping']
    )
  })
)

it.effect('applies auth to every HTTP verb and to requestStatus', () =>
  Effect.gen(function* () {
    const { client, requests } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://auth.test',
      applyAuth: (request) => request.pipe(HttpClientRequest.setHeaders({ 'x-test-auth': 'yes' })),
      errors: testErrors,
    })

    yield* jsonClient.getJson('/a', ItemSchema)
    yield* jsonClient.postJson('/b', ItemSchema, { name: 'ok' })
    yield* jsonClient.putJson('/c', ItemSchema, { name: 'ok' })
    yield* jsonClient.deleteJson('/d', ItemSchema)
    yield* jsonClient.requestStatus('post', '/e')

    const recorded = yield* Ref.get(requests)
    assert.strictEqual(recorded.length, 5)
    assert.deepStrictEqual(
      recorded.map((request) => authHeaderOf(request.raw)),
      ['yes', 'yes', 'yes', 'yes', 'yes']
    )
  })
)

it.effect('sends a JSON body for postJson and putJson, and no body for getJson/deleteJson', () =>
  Effect.gen(function* () {
    const { client, requests } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://body.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    yield* jsonClient.postJson('/things', ItemSchema, { name: 'new-thing' })
    yield* jsonClient.putJson('/things/1', ItemSchema, { name: 'updated-thing' })
    yield* jsonClient.getJson('/things/1', ItemSchema)
    yield* jsonClient.deleteJson('/things/1', ItemSchema)

    const recorded = yield* Ref.get(requests)
    const decodeJsonBody = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)
    const bodyOf = (index: number) =>
      Effect.gen(function* () {
        const record = recorded[index]
        if (record === undefined) {
          return 'missing'
        }
        const { body } = record.raw
        return body._tag === 'Uint8Array' ? yield* decodeJsonBody(new TextDecoder().decode(body.body)) : body._tag
      })

    assert.deepStrictEqual(yield* bodyOf(0), { name: 'new-thing' })
    assert.deepStrictEqual(yield* bodyOf(1), { name: 'updated-thing' })
    assert.strictEqual(yield* bodyOf(2), 'Empty')
    assert.strictEqual(yield* bodyOf(3), 'Empty')
  })
)

it.effect('maps request body encoding failures to decodeError', () =>
  Effect.gen(function* () {
    const { client } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://encode.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    const error = yield* jsonClient.postJson('/things', ItemSchema, { value: 10n }).pipe(Effect.flip)

    assert.strictEqual(error.kind, 'decode')
  })
)

const getJsonWithStatus = (status: number) =>
  Effect.gen(function* () {
    const { client } = yield* clientFrom(() => ({ status, body: { name: 'ok' } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://boundary.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })
    return yield* jsonClient.getJson('/item', ItemSchema)
  })

// The Web `Response` constructor this test doubles on rejects any status
// outside [200, 599], so the `response.status < 200` half of the boundary
// can't be exercised through a real HTTP mock here; 300 covers the upper
// half of the same comparison.
it.effect('treats 300 as httpError at the 2xx boundary', () =>
  Effect.gen(function* () {
    const above = yield* getJsonWithStatus(300).pipe(Effect.flip)

    assert.deepStrictEqual(above, { kind: 'http', status: 300 })
  })
)

it.effect('treats 200 and 299 as success at the 2xx boundary', () =>
  Effect.gen(function* () {
    const lower = yield* getJsonWithStatus(200)
    const upper = yield* getJsonWithStatus(299)

    assert.deepStrictEqual(lower, { name: 'ok' })
    assert.deepStrictEqual(upper, { name: 'ok' })
  })
)

it.effect('maps transport failures to unreachable', () =>
  Effect.gen(function* () {
    const jsonClient = makeJsonClient<TestError>({
      client: transportFailureClient,
      baseUrl: 'http://unreachable.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    const error = yield* jsonClient.getJson('/item', ItemSchema).pipe(Effect.flip)

    assert.strictEqual(error.kind, 'unreachable')
    if (error.kind === 'unreachable') {
      assert.strictEqual(error.message.includes('connection refused'), true)
    }
  })
)

it.effect('maps malformed response bodies to decodeError', () =>
  Effect.gen(function* () {
    const { client } = yield* clientFrom(() => ({ status: 200, body: { name: 42 } }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://decode.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    const error = yield* jsonClient.getJson('/item', ItemSchema).pipe(Effect.flip)

    assert.strictEqual(error.kind, 'decode')
    if (error.kind === 'decode') {
      assert.notStrictEqual(error.cause, undefined)
    }
  })
)

it.effect('execute runs a caller-built request through the same transport/status mapping', () =>
  Effect.gen(function* () {
    const { client: okClient } = yield* clientFrom(() => ({ status: 200, body: { name: 'ok' } }))
    const { client: errClient } = yield* clientFrom(() => ({ status: 500, body: {} }))
    const okJsonClient = makeJsonClient<TestError>({
      client: okClient,
      baseUrl: 'http://execute.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })
    const errJsonClient = makeJsonClient<TestError>({
      client: errClient,
      baseUrl: 'http://execute.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })
    const unreachableJsonClient = makeJsonClient<TestError>({
      client: transportFailureClient,
      baseUrl: 'http://execute.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    const okResponse = yield* okJsonClient.execute(HttpClientRequest.get('http://execute.test/custom'))
    assert.strictEqual(okResponse.status, 200)

    const httpErr = yield* errJsonClient.execute(HttpClientRequest.get('http://execute.test/custom')).pipe(Effect.flip)
    assert.deepStrictEqual(httpErr, { kind: 'http', status: 500 })

    const unreachableErr = yield* unreachableJsonClient
      .execute(HttpClientRequest.get('http://execute.test/custom'))
      .pipe(Effect.flip)
    assert.strictEqual(unreachableErr.kind, 'unreachable')
  })
)

it.effect('requestStatus returns the raw status code without decoding the body', () =>
  Effect.gen(function* () {
    const { client, requests } = yield* clientFrom(() => ({ status: 204 }))
    const jsonClient = makeJsonClient<TestError>({
      client,
      baseUrl: 'http://status.test',
      applyAuth: (request) => request,
      errors: testErrors,
    })

    const status = yield* jsonClient.requestStatus('post', '/things', {
      body: { name: 'ok' },
      query: [['dry-run', true]],
    })

    assert.strictEqual(status, 204)
    assert.deepStrictEqual(
      (yield* Ref.get(requests)).map((request) => ({ method: request.method, url: request.url })),
      [{ method: 'POST', url: 'http://status.test/things?dry-run=true' }]
    )
  })
)
