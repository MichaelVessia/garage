import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers as HttpHeaders, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import {
  TubearchivistApiLive,
  TubearchivistConfig,
  TubearchivistSessionCacheMemoryLive,
  channels,
  search,
  status,
  subscribe,
} from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly cookie?: string | undefined
  readonly csrf?: string | undefined
  readonly referer?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
  readonly setCookies?: ReadonlyArray<string> | undefined
}

const ConfigLayer = Layer.succeed(TubearchivistConfig, {
  get: Effect.succeed({ url: 'http://tubearchivist.example.test/', username: 'admin', password: 'secret' }),
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
          cookie: HttpHeaders.get(request.headers, 'cookie').pipe(Option.getOrUndefined),
          csrf: HttpHeaders.get(request.headers, 'x-csrftoken').pipe(Option.getOrUndefined),
          referer: HttpHeaders.get(request.headers, 'referer').pipe(Option.getOrUndefined),
        },
      ]).pipe(
        Effect.map(() => {
          const response = respond(request.method, url)
          const headers = new Headers()
          for (const cookie of response.setCookies ?? []) {
            headers.append('set-cookie', cookie)
          }
          const responseInit = { headers, status: response.status }
          return response.status === 204
            ? HttpClientResponse.fromWeb(request, new Response(null, responseInit))
            : HttpClientResponse.fromWeb(request, Response.json(response.body, responseInit))
        })
      )
    )
    return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
  })

const loginResponse = {
  status: 204,
  body: null,
  setCookies: ['csrftoken=csrf-1; Path=/', 'sessionid=session-1; Path=/'],
}

it.effect('TubeArchivist HTTP adapter logs in, caches cookies, and sends CSRF for mutations', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (method === 'POST' && url.pathname === '/api/user/login/') {
        return loginResponse
      }
      if (url.pathname === '/api/channel/' && method === 'POST') {
        return { status: 200, body: { queued: true } }
      }
      if (url.pathname === '/api/channel/') {
        return {
          status: 200,
          body: { data: [{ channel_id: 'UC1', channel_name: 'Channel', channel_subscribed: true }] },
        }
      }
      return { status: 200, body: {} }
    })
    const layer = TubearchivistApiLive.pipe(
      Layer.provideMerge(Layer.mergeAll(ConfigLayer, TubearchivistSessionCacheMemoryLive, fake.layer))
    )

    yield* Effect.gen(function* () {
      assert.strictEqual((yield* channels({ limit: 5 })).records[0]?.id, 'UC1')
      assert.strictEqual((yield* subscribe({ target: 'UC1' })).subscribed, true)
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.requests), [
      {
        method: 'POST',
        url: 'http://tubearchivist.example.test/api/user/login/',
        cookie: undefined,
        csrf: undefined,
        referer: undefined,
      },
      {
        method: 'GET',
        url: 'http://tubearchivist.example.test/api/channel/',
        cookie: 'sessionid=session-1; csrftoken=csrf-1',
        csrf: undefined,
        referer: undefined,
      },
      {
        method: 'POST',
        url: 'http://tubearchivist.example.test/api/channel/',
        cookie: 'sessionid=session-1; csrftoken=csrf-1',
        csrf: 'csrf-1',
        referer: 'http://tubearchivist.example.test/',
      },
    ])
  })
)

it.effect('TubeArchivist HTTP adapter maps status and search payloads', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (method === 'POST' && url.pathname === '/api/user/login/') {
        return loginResponse
      }
      if (url.pathname === '/api/health/') {
        return { status: 200, body: 'OK' }
      }
      if (url.pathname === '/api/search/') {
        return {
          status: 200,
          body: {
            queryType: 'simple',
            results: {
              video_results: [{ youtube_id: 'v1', title: 'Video', channel: { channel_name: 'Channel' } }],
              channel_results: [{ channel_id: 'UC1', channel_name: 'Channel' }],
              playlist_results: [{ playlist_id: 'PL1', playlist_name: 'Playlist' }],
            },
          },
        }
      }
      return { status: 200, body: {} }
    })
    const layer = TubearchivistApiLive.pipe(
      Layer.provideMerge(Layer.mergeAll(ConfigLayer, TubearchivistSessionCacheMemoryLive, fake.layer))
    )

    yield* Effect.gen(function* () {
      assert.strictEqual((yield* status).health, 'OK')
      const result = yield* search({ query: 'video', limit: 1 })
      assert.strictEqual(result.query, 'video')
      assert.strictEqual(result.queryType, 'simple')
      assert.strictEqual(result.videos.records[0]?.youtubeId, 'v1')
      assert.strictEqual(result.channels.records[0]?.id, 'UC1')
      assert.strictEqual(result.playlists.records[0]?.playlistId, 'PL1')
    }).pipe(Effect.provide(layer))
  })
)
