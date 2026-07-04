import { makeConfigReaders } from '@garage/cli-protocol'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { envMissing } from './errors.js'
import type { AdguardError } from './errors.js'
import type {
  ActiveClient,
  AdguardConfigValue,
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

export class AdguardConfig extends Context.Service<
  AdguardConfig,
  { readonly get: () => Effect.Effect<AdguardConfigValue, AdguardError> }
>()('@garage/adguard/services/AdguardConfig') {}

export class AdguardApi extends Context.Service<
  AdguardApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, AdguardError>
    readonly version: () => Effect.Effect<VersionResult, AdguardError>
    readonly stats: () => Effect.Effect<Stats, AdguardError>
    readonly statsInfo: () => Effect.Effect<StatsInfo, AdguardError>
    readonly queryLog: (options: LimitOptions) => Effect.Effect<ListResult<QueryLogEntry>, AdguardError>
    readonly queryLogSearch: (options: SearchOptions) => Effect.Effect<ListResult<QueryLogEntry>, AdguardError>
    readonly clients: () => Effect.Effect<ClientsResult, AdguardError>
    readonly clientsActive: (options: ClientLookupOptions) => Effect.Effect<ListResult<ActiveClient>, AdguardError>
    readonly filters: () => Effect.Effect<FiltersResult, AdguardError>
    readonly rules: () => Effect.Effect<ListResult<string>, AdguardError>
    readonly dnsConfig: () => Effect.Effect<JsonObject, AdguardError>
    readonly dhcpStatus: () => Effect.Effect<DhcpStatus, AdguardError>
    readonly protectionToggle: (options: ProtectionToggleOptions) => Effect.Effect<ProtectionState, AdguardError>
  }
>()('@garage/adguard/services/AdguardApi') {}

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

export const AdguardConfigLive = Layer.effect(
  AdguardConfig,
  Effect.gen(function* () {
    const readConfig = Effect.fn('AdguardConfig.get')(
      function* () {
        const url = yield* readRequiredString('ADGUARD_URL')
        const username = yield* readRequiredString('ADGUARD_USERNAME')
        const password = yield* readRequiredSecret('ADGUARD_PASSWORD')
        return { url, username, password }
      },
      Effect.annotateLogs({ package: '@garage/adguard', service: 'AdguardConfig', method: 'get' })
    )
    const cachedGet = yield* Effect.cached(readConfig())
    return AdguardConfig.of({ get: () => cachedGet })
  })
)
