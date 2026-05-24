import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import {
  AdguardApi,
  AdguardConfig,
  clients,
  clientsActive,
  defaultLimit,
  dhcpStatus,
  dnsConfig,
  filters,
  protectionToggle,
  queryLog,
  queryLogSearch,
  rules,
  stats,
  statsInfo,
  status,
  version,
} from '../src/index.js'
import type { ClientLookupOptions, LimitOptions, ProtectionToggleOptions, SearchOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(AdguardConfig, {
  get: Effect.succeed({ url: 'http://adguard.example.test', username: 'admin', password: 'secret' }),
})

const makeApiLayer = Effect.gen(function* () {
  const queryLogOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const clientLookups = yield* Ref.make<ReadonlyArray<ClientLookupOptions>>([])
  const toggles = yield* Ref.make<ReadonlyArray<ProtectionToggleOptions>>([])
  const api = AdguardApi.of({
    status: Effect.succeed({ version: 'v0.107.67', running: true, protectionEnabled: true }),
    version: Effect.succeed({ version: 'v0.107.67' }),
    stats: Effect.succeed({
      numDnsQueries: 100,
      numBlockedFiltering: 10,
      topQueriedDomains: [{ name: 'example.com', count: 20 }],
      topBlockedDomains: [{ name: 'ads.example.com', count: 5 }],
      topClients: [{ name: '192.0.2.2', count: 30 }],
    }),
    statsInfo: Effect.succeed({ interval: 1 }),
    queryLog: (options) =>
      Ref.update(queryLogOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ question: 'example.com', client: '192.0.2.2', answer: '1.1.1.1' }] })
      ),
    queryLogSearch: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ question: options.query, client: '192.0.2.2', answer: '' }] })
      ),
    clients: Effect.succeed({
      configured: [{ name: 'Test Client', ids: ['192.0.2.2'] }],
      autoCount: 1,
      autoSample: [{ name: 'Guest Device', ip: '192.0.2.3' }],
    }),
    clientsActive: (options) =>
      Ref.update(clientLookups, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ ip: options.ip, name: 'Test Client' }] })
      ),
    filters: Effect.succeed({
      enabled: true,
      intervalHours: 24,
      userRulesCount: 2,
      blocklists: [{ id: 1, name: 'AdGuard DNS filter' }],
      allowlists: [],
    }),
    rules: Effect.succeed({ count: 1, records: ['@@||example.com^'] }),
    dnsConfig: Effect.succeed({ upstream_mode: 'parallel' }),
    dhcpStatus: Effect.succeed({
      enabled: false,
      leaseCount: 0,
      staticLeaseCount: 0,
      leases: [],
      staticLeases: [],
    }),
    protectionToggle: (options) =>
      Ref.update(toggles, (records) => [...records, options]).pipe(
        Effect.as({ protectionEnabled: options.state === 'on', protectionDisabledDuration: 0 })
      ),
  })

  return { layer: Layer.succeed(AdguardApi, api), queryLogOptions, searchOptions, clientLookups, toggles }
})

it.effect('runs AdGuard read and mutation operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).protectionEnabled, true)
    assert.strictEqual((yield* version.pipe(Effect.provide(layer))).version, 'v0.107.67')
    assert.strictEqual((yield* stats.pipe(Effect.provide(layer))).numDnsQueries, 100)
    assert.strictEqual((yield* statsInfo.pipe(Effect.provide(layer))).interval, 1)
    assert.strictEqual((yield* queryLog({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.question, 'example.com')
    assert.strictEqual(
      (yield* queryLogSearch({ query: 'ads', limit: 7 }).pipe(Effect.provide(layer))).records[0]?.question,
      'ads'
    )
    assert.strictEqual((yield* clients.pipe(Effect.provide(layer))).configured[0]?.name, 'Test Client')
    assert.strictEqual(
      (yield* clientsActive({ ip: '192.0.2.2' }).pipe(Effect.provide(layer))).records[0]?.name,
      'Test Client'
    )
    assert.strictEqual((yield* filters.pipe(Effect.provide(layer))).userRulesCount, 2)
    assert.strictEqual((yield* rules.pipe(Effect.provide(layer))).records[0], '@@||example.com^')
    assert.strictEqual((yield* dnsConfig.pipe(Effect.provide(layer))).upstream_mode, 'parallel')
    assert.strictEqual((yield* dhcpStatus.pipe(Effect.provide(layer))).enabled, false)
    assert.strictEqual((yield* protectionToggle({ state: 'off' }).pipe(Effect.provide(layer))).protectionEnabled, false)
    assert.deepStrictEqual(yield* Ref.get(fake.queryLogOptions), [{ limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'ads', limit: 7 }])
    assert.deepStrictEqual(yield* Ref.get(fake.clientLookups), [{ ip: '192.0.2.2' }])
    assert.deepStrictEqual(yield* Ref.get(fake.toggles), [{ state: 'off' }])
    assert.strictEqual(defaultLimit, 50)
  })
)
