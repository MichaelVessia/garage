import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import {
  BookloreApiLive,
  BookloreConfig,
  BookloreTokenCacheMemoryLive,
  books,
  bookInfo,
  search,
  status,
} from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly authorization?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(BookloreConfig, {
  get: Effect.succeed({ url: 'http://booklore.example.test/', username: 'fixture-user', password: 'secret' }),
})

const base64Url = (value: Readonly<Record<string, unknown>>): string =>
  btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

const token = `${base64Url({ alg: 'none' })}.${base64Url({ exp: 4_102_444_800 })}.signature`

const makeHttpClientLayer = (respond: (method: string, url: URL) => FakeResponse) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const client = HttpClient.make((request, url) =>
      Ref.update(requests, (records) => [
        ...records,
        {
          method: request.method,
          url: url.toString(),
          authorization: Headers.get(request.headers, 'authorization').pipe(Option.getOrUndefined),
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

it.effect('BookloreApiLive logs in once and reuses bearer auth for reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (method === 'POST' && url.pathname === '/api/v1/auth/login') {
        return { status: 200, body: { accessToken: token, refreshToken: 'refresh', isDefaultPassword: false } }
      }
      if (url.pathname === '/api/v1/version') {
        return { status: 200, body: { current: 'development', latest: 'v0.1.0' } }
      }
      return { status: 200, body: [] }
    })
    const layer = BookloreApiLive.pipe(
      Layer.provideMerge(Layer.mergeAll(ConfigLayer, BookloreTokenCacheMemoryLive, fake.layer))
    )

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* status, { current: 'development', latest: 'v0.1.0' })
      assert.deepStrictEqual(yield* books({ limit: 5 }), { count: 0, records: [] })
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.requests), [
      { method: 'POST', url: 'http://booklore.example.test/api/v1/auth/login', authorization: undefined },
      { method: 'GET', url: 'http://booklore.example.test/api/v1/version', authorization: `Bearer ${token}` },
      { method: 'GET', url: 'http://booklore.example.test/api/v1/books', authorization: `Bearer ${token}` },
    ])
  })
)

it.effect('BookloreApiLive normalizes book metadata and client-side search', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (method === 'POST' && url.pathname === '/api/v1/auth/login') {
        return { status: 200, body: { accessToken: token } }
      }
      if (url.pathname === '/api/v1/books/42') {
        return {
          status: 200,
          body: {
            id: 42,
            title: null,
            authors: null,
            libraryId: 1,
            metadata: { title: 'Fixture Novel One', authors: ['Fixture Author'] },
          },
        }
      }
      return {
        status: 200,
        body: [
          {
            id: 42,
            title: null,
            authors: null,
            libraryId: 1,
            metadata: { title: 'Fixture Novel One', authors: ['Fixture Author'] },
          },
          { id: 43, title: 'Fixture Novel Two', authors: 'Fixture Author', libraryId: 1 },
        ],
      }
    })
    const layer = BookloreApiLive.pipe(
      Layer.provideMerge(Layer.mergeAll(ConfigLayer, BookloreTokenCacheMemoryLive, fake.layer))
    )

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* bookInfo({ id: '42' }), {
        id: 42,
        title: 'Fixture Novel One',
        authors: ['Fixture Author'],
        libraryId: 1,
        metadata: { title: 'Fixture Novel One', authors: ['Fixture Author'], publishedDate: undefined },
      })
      assert.deepStrictEqual(yield* search({ query: 'fixture', limit: 1 }), {
        query: 'fixture',
        total: 2,
        count: 1,
        records: [
          {
            id: 42,
            title: 'Fixture Novel One',
            authors: ['Fixture Author'],
            libraryId: 1,
            metadata: { title: 'Fixture Novel One', authors: ['Fixture Author'], publishedDate: undefined },
          },
        ],
      })
    }).pipe(Effect.provide(layer))
  })
)
