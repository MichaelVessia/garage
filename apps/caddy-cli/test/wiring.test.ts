import { assert, it } from '@effect/vitest'
import { CaddyApiLive, CaddyConfig } from '@garage/caddy'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeCaddy } from '../src/index.js'

it.effect('executes routes through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        apps: {
          http: {
            servers: {
              srv0: {
                listen: [':443'],
                routes: [
                  {
                    match: [{ host: ['sonarr.example.test'] }],
                    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: '192.0.2.38:8989' }] }],
                  },
                ],
              },
            },
          },
        },
      },
    }))
    const config = Layer.succeed(CaddyConfig, {
      get: () => Effect.succeed({ url: 'http://caddy.example.test:2019/' }),
    })
    const api = CaddyApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))
    const layer = Layer.mergeAll(api, FileSystem.layerNoop({}))

    const envelope = yield* executeCaddy(['routes']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'caddy routes',
      result: {
        count: 1,
        records: [
          {
            server: 'srv0',
            listen: [':443'],
            routes: [{ match: [{ host: ['sonarr.example.test'] }], upstreams: ['192.0.2.38:8989'] }],
          },
        ],
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 1)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        accept: Headers.get(request.raw.headers, 'accept').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://caddy.example.test:2019/config/',
          accept: 'application/json',
        },
      ]
    )
  })
)
