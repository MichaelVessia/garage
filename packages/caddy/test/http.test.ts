import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import { CaddyApiLive, CaddyConfig, pkiCa, reload, routes, upstreams } from '../src/index.js'

const ConfigLayer = Layer.succeed(CaddyConfig, {
  get: () => Effect.succeed({ url: 'http://caddy.example.test:2019/' }),
})

it.effect('CaddyApiLive maps routes and upstreams', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_, url) =>
      url.pathname === '/config/'
        ? {
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
          }
        : { status: 200, body: [{ address: '192.0.2.38:8989', fails: 0, num_requests: 12 }] }
    )
    const layer = CaddyApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(yield* routes.pipe(Effect.provide(layer)), {
      count: 1,
      records: [
        {
          server: 'srv0',
          listen: [':443'],
          routes: [{ match: [{ host: ['sonarr.example.test'] }], upstreams: ['192.0.2.38:8989'] }],
        },
      ],
    })
    assert.strictEqual((yield* upstreams.pipe(Effect.provide(layer))).records[0]?.numRequests, 12)
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => request.url),
      ['http://caddy.example.test:2019/config/', 'http://caddy.example.test:2019/reverse_proxy/upstreams']
    )
  })
)

it.effect('CaddyApiLive maps pki-ca and reloads config', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, _url) => {
      if (method === 'POST') {
        return { status: 200, body: null }
      }
      return {
        status: 200,
        body: {
          id: 'local',
          name: 'Caddy Local Authority',
          root_common_name: 'Caddy Local Authority Root',
        },
      }
    })
    const layer = CaddyApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual((yield* pkiCa.pipe(Effect.provide(layer))).rootCommonName, 'Caddy Local Authority Root')
    assert.deepStrictEqual(yield* reload({ apps: {} }).pipe(Effect.provide(layer)), { reloaded: true, httpStatus: 200 })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [
        { method: 'GET', url: 'http://caddy.example.test:2019/pki/ca/local' },
        { method: 'POST', url: 'http://caddy.example.test:2019/load' },
      ]
    )
  })
)
