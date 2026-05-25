import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { JellyseerrApiLive, JellyseerrConfig, approve, deleteRequest, requests, search, status } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly apiKey?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(JellyseerrConfig, {
  get: () => Effect.succeed({ url: 'http://jellyseerr.example.test/', apiKey: 'secret' }),
})

const makeHttpClientLayer = (respond: (method: string, url: URL) => FakeResponse) =>
  Effect.gen(function* () {
    const requestsRef = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const client = HttpClient.make((request, url) =>
      Ref.update(requestsRef, (records) => [
        ...records,
        {
          method: request.method,
          url: url.toString(),
          apiKey: Headers.get(request.headers, 'x-api-key').pipe(Option.getOrUndefined),
        },
      ]).pipe(
        Effect.map(() => {
          const response = respond(request.method, url)
          const webResponse =
            response.status === 204
              ? new Response(null, { status: response.status })
              : Response.json(response.body, { status: response.status })
          return HttpClientResponse.fromWeb(request, webResponse)
        })
      )
    )

    return { layer: Layer.succeed(HttpClient.HttpClient, client), requestsRef }
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
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: { version: '2.0.0', commitTag: 'v2.0.0', updateAvailable: false },
    }))
    const layer = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const records = yield* Ref.get(fake.requestsRef)

    assert.strictEqual(result.version, '2.0.0')
    assert.deepStrictEqual(records, [
      { method: 'GET', url: 'http://jellyseerr.example.test/api/v1/status', apiKey: 'secret' },
    ])
  })
)

it.effect('JellyseerrApiLive maps requests and search list responses', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((_method, url) => {
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
    const records = yield* Ref.get(fake.requestsRef)

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
    const fake = yield* makeHttpClientLayer((method) =>
      method === 'DELETE' ? { status: 204, body: null } : { status: 200, body: requestBody }
    )
    const layer = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const approved = yield* approve(42).pipe(Effect.provide(layer))
    const deleted = yield* deleteRequest(42).pipe(Effect.provide(layer))
    const records = yield* Ref.get(fake.requestsRef)

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
