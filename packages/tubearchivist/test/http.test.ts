import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import type { RecordedHttpRequest, RecordingHttpResponse } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers as HttpHeaders } from 'effect/unstable/http'

import {
  TubearchivistApiLive,
  TubearchivistConfig,
  TubearchivistSessionCacheMemoryLive,
  channels,
  search,
  status,
  subscribe,
} from '../src/index.js'

const ConfigLayer = Layer.succeed(TubearchivistConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://tubearchivist.example.test/',
      username: 'admin',
      password: Redacted.make('secret'),
    }),
})

const withCookies = (records: ReadonlyArray<RecordedHttpRequest>) =>
  records.map((request) => ({
    method: request.method,
    url: request.url,
    cookie: HttpHeaders.get(request.raw.headers, 'cookie').pipe(Option.getOrUndefined),
    csrf: HttpHeaders.get(request.raw.headers, 'x-csrftoken').pipe(Option.getOrUndefined),
    referer: HttpHeaders.get(request.raw.headers, 'referer').pipe(Option.getOrUndefined),
  }))

const setCookies = (cookies: ReadonlyArray<string>): Headers => {
  const headers = new Headers()
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }
  return headers
}

const loginResponse: RecordingHttpResponse = {
  status: 204,
  headers: setCookies(['csrftoken=csrf-1; Path=/', 'sessionid=session-1; Path=/']),
}

it.effect('TubeArchivist HTTP adapter logs in, caches cookies, and sends CSRF for mutations', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, url) => {
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

    assert.deepStrictEqual(withCookies(yield* Ref.get(fake.requests)), [
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
    const fake = yield* makeRecordingHttpClient((method, url) => {
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
