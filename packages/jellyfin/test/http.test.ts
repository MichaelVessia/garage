import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { JellyfinApiLive, JellyfinConfig, recentlyAdded, runTask, status } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly token?: string | undefined
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(JellyfinConfig, {
  get: () => Effect.succeed({ url: 'http://jellyfin.example.test/', apiKey: 'secret' }),
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
          token: Headers.get(request.headers, 'x-emby-token').pipe(Option.getOrUndefined),
        },
      ]).pipe(
        Effect.map(() => {
          const response = respond(request.method, url)
          const webResponse =
            response.status === 204
              ? new Response(null, { status: 204 })
              : Response.json(response.body, { status: response.status })
          return HttpClientResponse.fromWeb(request, webResponse)
        })
      )
    )
    return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
  })

it.effect('JellyfinApiLive authenticates and maps status', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: { ServerName: 'Jellyfin', Version: '10.10.7' },
    }))
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).version, '10.10.7')
    assert.deepStrictEqual(yield* Ref.get(fake.requests), [
      { method: 'GET', url: 'http://jellyfin.example.test/System/Info', token: 'secret' },
    ])
  })
)

it.effect('JellyfinApiLive selects an enabled user for latest items and can run tasks', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((method, url) => {
      if (url.pathname === '/Users') {
        return {
          status: 200,
          body: [
            { Id: 'disabled', Name: 'Disabled', Policy: { IsDisabled: true } },
            { Id: 'u1', Name: 'Test User', Policy: { IsDisabled: false } },
          ],
        }
      }
      if (method === 'POST') {
        return { status: 204, body: null }
      }
      return { status: 200, body: [{ Id: 'i1', Name: 'Linux ISO', Type: 'Movie' }] }
    })
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual((yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.name, 'Linux ISO')
    assert.deepStrictEqual(yield* runTask('task1').pipe(Effect.provide(layer)), {
      started: true,
      taskId: 'task1',
      httpStatus: 204,
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [
        { method: 'GET', url: 'http://jellyfin.example.test/Users' },
        { method: 'GET', url: 'http://jellyfin.example.test/Users/u1/Items/Latest?Limit=5' },
        { method: 'POST', url: 'http://jellyfin.example.test/ScheduledTasks/Running/task1' },
      ]
    )
  })
)
