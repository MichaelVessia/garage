import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { ImmichApiLive, ImmichConfig, search, status, users } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly token?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(ImmichConfig, {
  get: () => Effect.succeed({ url: 'http://immich.example.test/', apiKey: 'secret' }),
})

const makeHttpClientLayer = (respond: (method: string, url: URL) => FakeResponse) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const client = HttpClient.make((request, url) =>
      Ref.update(requests, (records) => [
        ...records,
        {
          method: request.method,
          url: url.toString(),
          token: Headers.get(request.headers, 'x-api-key').pipe(Option.getOrUndefined),
        },
      ]).pipe(
        Effect.map(() => {
          const response = respond(request.method, url)
          return HttpClientResponse.fromWeb(request, Response.json(response.body, { status: response.status }))
        })
      )
    )
    return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
  })

it.effect('ImmichApiLive authenticates and maps status', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((_, url) =>
      url.pathname === '/api/server/version'
        ? { status: 200, body: { major: 2, minor: 5, patch: 6 } }
        : { status: 200, body: { res: 'pong' } }
    )
    const layer = ImmichApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(yield* status.pipe(Effect.provide(layer)), {
      version: '2.5.6',
      versionParts: { major: 2, minor: 5, patch: 6 },
      ping: 'pong',
    })
    assert.deepStrictEqual(yield* Ref.get(fake.requests), [
      { method: 'GET', url: 'http://immich.example.test/api/server/version', token: 'secret' },
      { method: 'GET', url: 'http://immich.example.test/api/server/ping', token: 'secret' },
    ])
  })
)

it.effect('ImmichApiLive falls back from admin users and empty smart search', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (url.pathname === '/api/admin/users') {
        return { status: 403, body: { message: 'forbidden' } }
      }
      if (url.pathname === '/api/users') {
        return { status: 200, body: [{ id: 'u1', name: 'Test User', email: 'user@example.test' }] }
      }
      if (method === 'POST' && url.pathname === '/api/search/smart') {
        return { status: 200, body: { assets: { total: 0, count: 0, items: [] } } }
      }
      return {
        status: 200,
        body: {
          assets: {
            total: 1,
            count: 1,
            items: [{ id: 'asset1', type: 'IMAGE', originalFileName: 'IMG_0001.jpg' }],
          },
        },
      }
    })
    const layer = ImmichApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual(
      (yield* users.pipe(Effect.provide(layer))).note,
      'admin fields unavailable: API key lacks adminUser.read'
    )
    assert.deepStrictEqual(yield* search({ query: 'IMG', limit: 5 }).pipe(Effect.provide(layer)), {
      mode: 'metadata',
      query: 'IMG',
      total: 1,
      count: 1,
      records: [
        {
          id: 'asset1',
          type: 'IMAGE',
          originalFileName: 'IMG_0001.jpg',
          fileCreatedAt: undefined,
          exifInfo: undefined,
        },
      ],
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [
        { method: 'GET', url: 'http://immich.example.test/api/admin/users' },
        { method: 'GET', url: 'http://immich.example.test/api/users' },
        { method: 'POST', url: 'http://immich.example.test/api/search/smart' },
        { method: 'POST', url: 'http://immich.example.test/api/search/metadata' },
      ]
    )
  })
)

it.effect('ImmichApiLive does not fall back from admin users decode failures', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((_, url) =>
      url.pathname === '/api/admin/users'
        ? { status: 200, body: { users: [] } }
        : { status: 200, body: [{ id: 'u1', name: 'Fallback User', email: 'fallback@example.test' }] }
    )
    const layer = ImmichApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* users.pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'ImmichDecodeError')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [{ method: 'GET', url: 'http://immich.example.test/api/admin/users' }]
    )
  })
)

it.effect('ImmichApiLive does not fall back from smart search server failures', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) =>
      method === 'POST' && url.pathname === '/api/search/smart'
        ? { status: 500, body: { message: 'server error' } }
        : {
            status: 200,
            body: {
              assets: {
                total: 1,
                count: 1,
                items: [{ id: 'asset1', type: 'IMAGE', originalFileName: 'IMG_0001.jpg' }],
              },
            },
          }
    )
    const layer = ImmichApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* search({ query: 'IMG', limit: 5 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'ImmichHttpError')
    assert.strictEqual(error.message, 'Immich returned HTTP 500')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [{ method: 'POST', url: 'http://immich.example.test/api/search/smart' }]
    )
  })
)
