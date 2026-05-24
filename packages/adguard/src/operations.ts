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

const requireConfig = Effect.gen(function* () {
  const config = yield* AdguardConfig
  yield* config.get
})

export const status: Effect.Effect<SystemStatus, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.status
})

export const version: Effect.Effect<VersionResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.version
})

export const stats: Effect.Effect<Stats, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.stats
})

export const statsInfo: Effect.Effect<StatsInfo, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.statsInfo
})

export const queryLog = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<QueryLogEntry>, AdguardError, AdguardApi | AdguardConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AdguardApi
    return yield* api.queryLog(options)
  })

export const queryLogSearch = (
  options: SearchOptions
): Effect.Effect<ListResult<QueryLogEntry>, AdguardError, AdguardApi | AdguardConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AdguardApi
    return yield* api.queryLogSearch(options)
  })

export const clients: Effect.Effect<ClientsResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.clients
})

export const clientsActive = (
  options: ClientLookupOptions
): Effect.Effect<ListResult<ActiveClient>, AdguardError, AdguardApi | AdguardConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AdguardApi
    return yield* api.clientsActive(options)
  })

export const filters: Effect.Effect<FiltersResult, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.filters
})

export const rules: Effect.Effect<ListResult<string>, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* AdguardApi
    return yield* api.rules
  }
)

export const dnsConfig: Effect.Effect<JsonObject, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.dnsConfig
})

export const dhcpStatus: Effect.Effect<DhcpStatus, AdguardError, AdguardApi | AdguardConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AdguardApi
  return yield* api.dhcpStatus
})

export const protectionToggle = (
  options: ProtectionToggleOptions
): Effect.Effect<ProtectionState, AdguardError, AdguardApi | AdguardConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AdguardApi
    return yield* api.protectionToggle(options)
  })
