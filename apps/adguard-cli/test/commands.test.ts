import { assert, it } from '@effect/vitest'
import { AdguardApi, AdguardConfig, envMissing } from '@garage/adguard'
import type { ClientLookupOptions, LimitOptions, ProtectionToggleOptions, SearchOptions } from '@garage/adguard'
import { Effect, Layer, Ref } from 'effect'

import { executeAdguard } from '../src/index.js'

const ConfigLayer = Layer.succeed(AdguardConfig, {
  get: () => Effect.succeed({ url: 'http://adguard.example.test', username: 'admin', password: 'secret' }),
})

const MissingConfigLayer = Layer.succeed(AdguardConfig, {
  get: () => Effect.fail(envMissing('ADGUARD_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const queryLogOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const clientLookups = yield* Ref.make<ReadonlyArray<ClientLookupOptions>>([])
  const toggles = yield* Ref.make<ReadonlyArray<ProtectionToggleOptions>>([])
  const api = AdguardApi.of({
    status: () => Effect.succeed({ version: 'v0.107.67', running: true, protectionEnabled: true }),
    version: () => Effect.succeed({ version: 'v0.107.67' }),
    stats: () =>
      Effect.succeed({
        numDnsQueries: 100,
        numBlockedFiltering: 10,
        topQueriedDomains: [],
        topBlockedDomains: [],
        topClients: [],
      }),
    statsInfo: () => Effect.succeed({ interval: 1 }),
    queryLog: (options) =>
      Ref.update(queryLogOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ question: 'example.com', answer: '' }] })
      ),
    queryLogSearch: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ question: options.query, answer: '' }] })
      ),
    clients: () => Effect.succeed({ configured: [{ name: 'Test Client' }], autoCount: 0, autoSample: [] }),
    clientsActive: (options) =>
      Ref.update(clientLookups, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ ip: options.ip, name: 'Test Client' }] })
      ),
    filters: () => Effect.succeed({ userRulesCount: 1, blocklists: [], allowlists: [] }),
    rules: () => Effect.succeed({ count: 1, records: ['@@||example.com^'] }),
    dnsConfig: () => Effect.succeed({ upstream_mode: 'parallel' }),
    dhcpStatus: () =>
      Effect.succeed({ enabled: false, leaseCount: 0, staticLeaseCount: 0, leases: [], staticLeases: [] }),
    protectionToggle: (options) =>
      Ref.update(toggles, (records) => [...records, options]).pipe(
        Effect.as({ protectionEnabled: options.state === 'on', protectionDisabledDuration: 0 })
      ),
  })
  return { layer: Layer.succeed(AdguardApi, api), queryLogOptions, searchOptions, clientLookups, toggles }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const ok = yield* executeAdguard([]).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))
    const missing = yield* executeAdguard([]).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer)))

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, {
      configured: true,
      version: 'v0.107.67',
      protectionEnabled: true,
    })
    assert.strictEqual(missing.ok, true)
    if (!missing.ok || !('health' in missing.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(missing.result.health, { configured: false })
  })
)

it.effect('bounded and lookup commands pass arguments', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    yield* executeAdguard(['query-log', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeAdguard(['query-log-search', 'ads', 'example', '--limit', '7']).pipe(Effect.provide(layer))
    yield* executeAdguard(['clients-active', '192.0.2.2']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.queryLogOptions), [{ limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'ads example', limit: 7 }])
    assert.deepStrictEqual(yield* Ref.get(fake.clientLookups), [{ ip: '192.0.2.2' }])
  })
)

it.effect('protection-toggle requires confirmation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const blocked = yield* executeAdguard(['protection-toggle', 'off']).pipe(Effect.provide(layer))
    const allowed = yield* executeAdguard(['protection-toggle', 'off', '--confirm-toggle']).pipe(Effect.provide(layer))

    assert.strictEqual(blocked.ok, false)
    assert.strictEqual(allowed.ok, true)
    assert.deepStrictEqual(yield* Ref.get(fake.toggles), [{ state: 'off' }])
  })
)

it.effect('missing env on subcommands returns an error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeAdguard(['stats']).pipe(
      Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer))
    )

    assert.strictEqual(envelope.ok, false)
    if (envelope.ok) {
      assert.fail('expected error envelope')
    }
    assert.strictEqual(envelope.error.code, 'ADGUARD_ENV_MISSING')
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    for (const args of [
      ['status'],
      ['version'],
      ['stats'],
      ['stats-info'],
      ['clients'],
      ['filters'],
      ['rules'],
      ['dns-config'],
      ['dhcp-status'],
    ]) {
      const envelope = yield* executeAdguard(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
