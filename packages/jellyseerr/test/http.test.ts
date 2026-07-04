import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { JellyseerrApiLive, JellyseerrConfig, approve, deleteRequest, requests, search, status } from '../src/index.js'

const ConfigLayer = Layer.succeed(JellyseerrConfig, {
  get: () => Effect.succeed({ url: 'http://jellyseerr.example.test/', apiKey: Redacted.make('secret') }),
})

const requestBody = {
  id: 42,
  status: 2,
  type: 'tv',
  requestedBy: { displayName: 'Test User' },
  media: { id: 7, tmdbId: 95_396, mediaType: 'tv', status: 5, title: 'Linux ISO Weekly' },
}

it.effect('JellyseerrApiLive sends authenticated status requests', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: { version: '2.0.0', commitTag: 'v2.0.0', updateAvailable: false },
    }))
    const layer = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const records = yield* Ref.get(fake.requests)

    assert.strictEqual(result.version, '2.0.0')
    assert.deepStrictEqual(
      records.map((record) => ({
        method: record.method,
        url: record.url,
        apiKey: Headers.get(record.raw.headers, 'x-api-key').pipe(Option.getOrUndefined),
      })),
      [{ method: 'GET', url: 'http://jellyseerr.example.test/api/v1/status', apiKey: 'secret' }]
    )
  })
)

it.effect('JellyseerrApiLive maps requests and search list responses', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_method, url) => {
      if (url.pathname === '/api/v1/search') {
        return {
          status: 200,
          body: { totalResults: 1, results: [{ id: 95_396, mediaType: 'tv', name: 'Linux ISO Weekly' }] },
        }
      }

      return { status: 200, body: { totalResults: 3, results: [requestBody] } }
    })
    const layer = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const requestResult = yield* requests({ limit: 5, filter: 'pending' }).pipe(Effect.provide(layer))
    const searchResult = yield* search({ query: 'Linux ISO', limit: 4 }).pipe(Effect.provide(layer))
    const records = yield* Ref.get(fake.requests)

    assert.strictEqual(requestResult.records[0]?.requestedBy, 'Test User')
    assert.strictEqual(searchResult.records[0]?.title, 'Linux ISO Weekly')
    assert.deepStrictEqual(
      records.map((record) => ({ method: record.method, url: record.url })),
      [
        { method: 'GET', url: 'http://jellyseerr.example.test/api/v1/request?take=5&sort=added&filter=pending' },
        { method: 'GET', url: 'http://jellyseerr.example.test/api/v1/search?query=Linux%20ISO&take=4' },
      ]
    )
  })
)

it.effect('JellyseerrApiLive posts approvals and deletes requests', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method) =>
      method === 'DELETE' ? { status: 204, body: null } : { status: 200, body: requestBody }
    )
    const layer = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const approved = yield* approve(42).pipe(Effect.provide(layer))
    const deleted = yield* deleteRequest(42).pipe(Effect.provide(layer))
    const records = yield* Ref.get(fake.requests)

    assert.strictEqual(approved.id, 42)
    assert.deepStrictEqual(deleted, { deleted: true, requestId: 42, httpStatus: 204 })
    assert.deepStrictEqual(
      records.map((record) => ({ method: record.method, url: record.url })),
      [
        { method: 'POST', url: 'http://jellyseerr.example.test/api/v1/request/42/approve' },
        { method: 'DELETE', url: 'http://jellyseerr.example.test/api/v1/request/42' },
      ]
    )
  })
)
