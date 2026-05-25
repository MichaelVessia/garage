import { Effect } from 'effect'

import type { AdguardError } from './errors.js'
import type {
  ActiveClient,
  ClientLookupOptions,
  ClientsResult,
  DhcpStatus,
  FiltersResult,
  JsonObject,
  LimitOptions,
  ListResult,
  ProtectionState,
  ProtectionToggleOptions,
  QueryLogEntry,
  SearchOptions,
  Stats,
  StatsInfo,
  SystemStatus,
  VersionResult,
} from './model.js'
import { AdguardApi, AdguardConfig } from './services.js'

export const defaultLimit = 50
export const searchLimit = 200
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

const requireConfig = Effect.fn('adguard.requireConfig')(function* () {
  const config = yield* AdguardConfig
  yield* config.get()
})

export const status: Effect.Effect<SystemStatus, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.status()
}).pipe(Effect.withSpan('adguard.status'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'status' }))

export const version: Effect.Effect<VersionResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.version()
}).pipe(Effect.withSpan('adguard.version'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'version' }))

export const stats: Effect.Effect<Stats, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.stats()
}).pipe(Effect.withSpan('adguard.stats'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'stats' }))

export const statsInfo: Effect.Effect<StatsInfo, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.statsInfo()
}).pipe(
  Effect.withSpan('adguard.statsInfo'),
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'statsInfo' })
)

export const queryLog: (
  options?: LimitOptions
) => Effect.Effect<ListResult<QueryLogEntry>, AdguardError, AdguardApi | AdguardConfig> = Effect.fn('adguard.queryLog')(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<QueryLogEntry>, AdguardError, AdguardApi | AdguardConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'adguard.limit': limitOptions.limit })
    yield* requireConfig()
    const api = yield* AdguardApi
    return yield* api.queryLog(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'queryLog' })
)

export const queryLogSearch = Effect.fn('adguard.queryLogSearch')(
  function* (
    options: SearchOptions
  ): Effect.fn.Return<ListResult<QueryLogEntry>, AdguardError, AdguardApi | AdguardConfig> {
    yield* Effect.annotateCurrentSpan({ 'adguard.query_length': options.query.length, 'adguard.limit': options.limit })
    yield* requireConfig()
    const api = yield* AdguardApi
    return yield* api.queryLogSearch(options)
  },
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'queryLogSearch' })
)

export const clients: Effect.Effect<ClientsResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.clients()
}).pipe(Effect.withSpan('adguard.clients'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'clients' }))

export const clientsActive = Effect.fn('adguard.clientsActive')(
  function* (
    options: ClientLookupOptions
  ): Effect.fn.Return<ListResult<ActiveClient>, AdguardError, AdguardApi | AdguardConfig> {
    yield* Effect.annotateCurrentSpan({ 'adguard.client_ip_present': options.ip.length > 0 })
    yield* requireConfig()
    const api = yield* AdguardApi
    return yield* api.clientsActive(options)
  },
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'clientsActive' })
)

export const filters: Effect.Effect<FiltersResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.filters()
}).pipe(Effect.withSpan('adguard.filters'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'filters' }))

export const rules: Effect.Effect<ListResult<string>, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(
  function* () {
    yield* requireConfig()
    const api = yield* AdguardApi
    return yield* api.rules()
  }
).pipe(Effect.withSpan('adguard.rules'), Effect.annotateLogs({ package: '@garage/adguard', operation: 'rules' }))

export const dnsConfig: Effect.Effect<JsonObject, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.dnsConfig()
}).pipe(
  Effect.withSpan('adguard.dnsConfig'),
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'dnsConfig' })
)

export const dhcpStatus: Effect.Effect<DhcpStatus, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* AdguardApi
  return yield* api.dhcpStatus()
}).pipe(
  Effect.withSpan('adguard.dhcpStatus'),
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'dhcpStatus' })
)

export const protectionToggle = Effect.fn('adguard.protectionToggle')(
  function* (
    options: ProtectionToggleOptions
  ): Effect.fn.Return<ProtectionState, AdguardError, AdguardApi | AdguardConfig> {
    yield* Effect.annotateCurrentSpan({ 'adguard.protection_state': options.state })
    yield* requireConfig()
    const api = yield* AdguardApi
    return yield* api.protectionToggle(options)
  },
  Effect.annotateLogs({ package: '@garage/adguard', operation: 'protectionToggle' })
)
