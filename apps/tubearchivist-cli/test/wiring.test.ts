import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { TubearchivistApiLive, TubearchivistConfig, TubearchivistSessionCacheMemoryLive } from '@garage/tubearchivist'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers as HttpHeaders } from 'effect/unstable/http'

import { executeTubearchivist } from '../src/index.js'

const setCookies = (cookies: ReadonlyArray<string>): Headers => {
  const headers = new Headers()
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }
  return headers
}

it.effect('executes channels through login, the memory cache, and the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, url) => {
      if (method === 'POST' && url.pathname === '/api/user/login/') {
        return {
          status: 204,
          headers: setCookies(['csrftoken=recording-csrf; Path=/', 'sessionid=recording-session; Path=/']),
        }
      }
      return {
        status: 200,
        body: {
          data: [
            {
              channel_id: 'UC1',
              channel_name: 'Fixture Channel',
              channel_subscribed: true,
              channel_active: true,
              channel_last_refresh: '2026-08-01T00:00:00Z',
            },
            { channel_id: 'UC2', channel_name: 'Second Channel' },
          ],
          paginate: { total_hits: 2, page_size: 2 },
        },
      }
    })
    const config = Layer.succeed(TubearchivistConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://tubearchivist.example.test/',
          username: 'recording-admin',
          password: Redacted.make('recording-secret'),
        }),
    })
    const layer = TubearchivistApiLive.pipe(
      Layer.provide(Layer.mergeAll(config, TubearchivistSessionCacheMemoryLive, fake.layer))
    )

    const envelope = yield* executeTubearchivist(['channels', '--limit', '1']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'tubearchivist channels --limit 1',
      result: {
        count: 1,
        total: 2,
        records: [
          {
            id: 'UC1',
            name: 'Fixture Channel',
            subscribed: true,
            active: true,
            lastRefresh: '2026-08-01T00:00:00Z',
          },
        ],
        moreAvailable: true,
      },
      next_actions: [],
    })
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        cookie: HttpHeaders.get(request.raw.headers, 'cookie').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'POST',
          url: 'http://tubearchivist.example.test/api/user/login/',
          cookie: undefined,
        },
        {
          method: 'GET',
          url: 'http://tubearchivist.example.test/api/channel/',
          cookie: 'sessionid=recording-session; csrftoken=recording-csrf',
        },
      ]
    )
  })
)
