import { assert, it } from '@effect/vitest'
import { CaddyApi, CaddyConfig, envMissing } from '@garage/caddy'
import type { JsonObject } from '@garage/caddy'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import { executeCaddy } from '../src/index.js'

const ConfigLayer = Layer.succeed(CaddyConfig, {
  get: () => Effect.succeed({ url: 'http://caddy.example.test:2019' }),
})

const MissingConfigLayer = Layer.succeed(CaddyConfig, {
  get: () => Effect.fail(envMissing('CADDY_URL')),
})

const makeFake = Effect.gen(function* () {
  const reloads = yield* Ref.make<ReadonlyArray<JsonObject>>([])
  const reads = yield* Ref.make<ReadonlyArray<string>>([])
  const apiLayer = Layer.effect(
    CaddyApi,
    Effect.gen(function* () {
      const config = yield* CaddyConfig
      const configured = <A>(effect: Effect.Effect<A>) => config.get().pipe(Effect.andThen(effect))
      return CaddyApi.of({
        config: () => configured(Effect.succeed({ apps: {} })),
        routes: () =>
          configured(
            Effect.succeed({
              count: 1,
              records: [
                {
                  server: 'srv0',
                  listen: [':443'],
                  routes: [{ match: [{ host: ['sonarr.example.test'] }], upstreams: ['192.0.2.38:8989'] }],
                },
              ],
            })
          ),
        upstreams: () => configured(Effect.succeed({ count: 1, records: [{ address: '192.0.2.38:8989', fails: 0 }] })),
        pkiCa: () => configured(Effect.succeed({ id: 'local', name: 'Caddy Local Authority' })),
        reload: (nextConfig) =>
          configured(
            Ref.update(reloads, (records) => [...records, nextConfig]).pipe(
              Effect.as({ reloaded: true, httpStatus: 200 })
            )
          ),
      })
    })
  )
  const fileSystemLayer = FileSystem.layerNoop({
    readFileString: (path) =>
      Ref.update(reads, (records) => [...records, path]).pipe(Effect.as('{"apps":{"http":{"servers":{}}}}')),
  })
  return { layer: Layer.mergeAll(apiLayer, fileSystemLayer), reloads, reads }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeFake
    const ok = yield* executeCaddy([]).pipe(Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer))))
    const missing = yield* executeCaddy([]).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.commands, [
      { command: 'caddy', description: 'Show this command tree and configuration health' },
      { command: 'caddy config', description: 'Return full active Caddy config' },
      { command: 'caddy routes', description: 'Return route matchers and reverse-proxy upstreams' },
      { command: 'caddy upstreams', description: 'Return live reverse-proxy upstream health' },
      { command: 'caddy pki-ca', description: 'Return local internal CA info' },
      {
        command: 'caddy reload <config.json> [--confirm-reload]',
        description: 'Replace the active config via POST /load',
        flags: [{ name: '--confirm-reload', description: 'Confirm full Caddy config replacement' }],
      },
    ])
    assert.deepStrictEqual(ok.result.health, { configured: true, reachable: true, routeServers: 1 })
    assert.strictEqual(missing.ok, true)
    if (!missing.ok || !('health' in missing.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(missing.result.health, { configured: false })
  })
)

it.effect('reload requires confirmation and reads config only when confirmed', () =>
  Effect.gen(function* () {
    const fake = yield* makeFake
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const blocked = yield* executeCaddy(['reload', 'next.json']).pipe(Effect.provide(layer))

    assert.strictEqual(blocked.ok, false)
    assert.deepStrictEqual(yield* Ref.get(fake.reads), [])
    assert.deepStrictEqual(yield* Ref.get(fake.reloads), [])

    const allowed = yield* executeCaddy(['reload', 'next.json', '--confirm-reload']).pipe(Effect.provide(layer))

    assert.strictEqual(allowed.ok, true)
    assert.deepStrictEqual(yield* Ref.get(fake.reads), ['next.json'])
    assert.deepStrictEqual(yield* Ref.get(fake.reloads), [{ apps: { http: { servers: {} } } }])
  })
)

it.effect('read commands preserve envelopes and tolerate extra arguments', () =>
  Effect.gen(function* () {
    const fake = yield* makeFake
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const configEnvelope = yield* executeCaddy(['config', 'ignored']).pipe(Effect.provide(layer))
    const routesEnvelope = yield* executeCaddy(['routes']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(configEnvelope, {
      ok: true,
      command: 'caddy config ignored',
      result: { apps: {} },
      next_actions: [],
    })
    assert.deepStrictEqual(routesEnvelope, {
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
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeFake
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    for (const args of [['config'], ['routes'], ['upstreams'], ['pki-ca']]) {
      const envelope = yield* executeCaddy(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
