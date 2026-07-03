import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { ProwlarrApiLive, ProwlarrConfig, search, status, sync, testIndexer } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly apiKey?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(ProwlarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://prowlarr.example.test/',
      apiKey: Redacted.make('secret'),
    }),
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
          apiKey: Headers.get(request.headers, 'x-api-key').pipe(Option.getOrUndefined),
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

it.effect('ProwlarrApiLive sends authenticated requests and decodes status', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: {
        appName: 'Prowlarr',
        version: '1.30.2',
        instanceName: 'Prowlarr',
        branch: 'main',
        runtimeVersion: '8.0.0',
        osName: 'linux',
      },
    }))
    const layer = ProwlarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      appName: 'Prowlarr',
      version: '1.30.2',
      instanceName: 'Prowlarr',
      branch: 'main',
      runtimeVersion: '8.0.0',
      osName: 'linux',
      osVersion: undefined,
      buildTime: undefined,
      isLinux: undefined,
      isProduction: undefined,
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://prowlarr.example.test/api/v1/system/status',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('ProwlarrApiLive maps search query params and release summaries', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: [
        {
          guid: 'release-1',
          indexerId: 1,
          indexer: 'Mirror Indexer',
          title: 'Linux ISO 2026 1080p',
          protocol: 'torrent',
          size: 2_097_152,
          seeders: 42,
          leechers: 1,
          grabs: 7,
          age: 1,
          publishDate: '2026-05-24T00:00:00Z',
          downloadUrl: 'https://example.test/download/1',
          infoUrl: 'https://example.test/info/1',
          categories: [2000],
        },
      ],
    }))
    const layer = ProwlarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* search('Linux ISO', { limit: 5, protocol: 'torrent', category: 2000 }).pipe(
      Effect.provide(layer)
    )
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      query: 'Linux ISO',
      type: 'search',
      count: 1,
      totalRecords: 1,
      records: [
        {
          guid: 'release-1',
          indexerId: 1,
          indexer: 'Mirror Indexer',
          title: 'Linux ISO 2026 1080p',
          protocol: 'torrent',
          size: 2_097_152,
          sizeMB: 2,
          seeders: 42,
          leechers: 1,
          grabs: 7,
          age: 1,
          publishDate: '2026-05-24T00:00:00Z',
          downloadUrl: 'https://example.test/download/1',
          infoUrl: 'https://example.test/info/1',
          categories: [2000],
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://prowlarr.example.test/api/v1/search?query=Linux%20ISO&type=search&limit=5&indexerIds=-2&categories=2000',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('ProwlarrApiLive posts indexer tests and treats validation failures as test results', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (method === 'GET' && url.pathname === '/api/v1/indexer/7') {
        return { status: 200, body: { id: 7, name: 'Mirror Indexer' } }
      }

      return { status: 400, body: [{ errorMessage: 'Login failed' }] }
    })
    const layer = ProwlarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* testIndexer(7).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, { indexerId: 7, passed: false, httpStatus: 400 })
    assert.deepStrictEqual(
      requests.map((request) => ({ method: request.method, url: request.url })),
      [
        { method: 'GET', url: 'http://prowlarr.example.test/api/v1/indexer/7' },
        { method: 'POST', url: 'http://prowlarr.example.test/api/v1/indexer/test' },
      ]
    )
  })
)

it.effect('ProwlarrApiLive queues application indexer sync', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: { id: 99, name: 'ApplicationIndexerSync', status: 'queued', queued: '2026-05-24T00:00:00Z' },
    }))
    const layer = ProwlarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* sync.pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      id: 99,
      name: 'ApplicationIndexerSync',
      status: 'queued',
      queued: '2026-05-24T00:00:00Z',
      started: undefined,
      ended: undefined,
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'POST',
        url: 'http://prowlarr.example.test/api/v1/command',
        apiKey: 'secret',
      },
    ])
  })
)
