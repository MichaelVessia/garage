import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import { CaddyApi, CaddyConfig, config, pkiCa, reload, routes, upstreams } from '../src/index.js'
import type { JsonObject } from '../src/index.js'

const ConfigLayer = Layer.succeed(CaddyConfig, {
  get: () => Effect.succeed({ url: 'http://caddy.example.test:2019' }),
})

const makeApiLayer = Effect.gen(function* () {
  const reloads = yield* Ref.make<ReadonlyArray<JsonObject>>([])
  const api = CaddyApi.of({
    config: () => Effect.succeed({ apps: {} }),
    routes: () =>
      Effect.succeed({
        count: 1,
        records: [
          {
            server: 'srv0',
            listen: [':443'],
            routes: [{ match: [{ host: ['sonarr.example.test'] }], upstreams: ['192.0.2.38:8989'] }],
          },
        ],
      }),
    upstreams: () => Effect.succeed({ count: 1, records: [{ address: '192.0.2.38:8989', fails: 0 }] }),
    pkiCa: () => Effect.succeed({ id: 'local', name: 'Caddy Local Authority' }),
    reload: (nextConfig) =>
      Ref.update(reloads, (records) => [...records, nextConfig]).pipe(Effect.as({ reloaded: true, httpStatus: 200 })),
  })

  return { layer: Layer.succeed(CaddyApi, api), reloads }
})

it.effect('runs Caddy read and reload operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)
    const nextConfig = { apps: { http: {} } }

    assert.deepStrictEqual(yield* config.pipe(Effect.provide(layer)), { apps: {} })
    assert.strictEqual((yield* routes.pipe(Effect.provide(layer))).records[0]?.server, 'srv0')
    assert.strictEqual((yield* upstreams.pipe(Effect.provide(layer))).records[0]?.address, '192.0.2.38:8989')
    assert.strictEqual((yield* pkiCa.pipe(Effect.provide(layer))).id, 'local')
    assert.deepStrictEqual(yield* reload(nextConfig).pipe(Effect.provide(layer)), { reloaded: true, httpStatus: 200 })
    assert.deepStrictEqual(yield* Ref.get(fake.reloads), [nextConfig])
  })
)
