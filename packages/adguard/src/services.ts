import { Config, Context, Effect, Layer } from 'effect'

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
  { readonly get: Effect.Effect<AdguardConfigValue, AdguardError> }
>()('@garage/adguard/services/AdguardConfig') {}

export class AdguardApi extends Context.Service<
  AdguardApi,
  {
    readonly status: Effect.Effect<SystemStatus, AdguardError>
    readonly version: Effect.Effect<VersionResult, AdguardError>
    readonly stats: Effect.Effect<Stats, AdguardError>
    readonly statsInfo: Effect.Effect<StatsInfo, AdguardError>
    readonly queryLog: (options: LimitOptions) => Effect.Effect<ListResult<QueryLogEntry>, AdguardError>
    readonly queryLogSearch: (options: SearchOptions) => Effect.Effect<ListResult<QueryLogEntry>, AdguardError>
    readonly clients: Effect.Effect<ClientsResult, AdguardError>
    readonly clientsActive: (options: ClientLookupOptions) => Effect.Effect<ListResult<ActiveClient>, AdguardError>
    readonly filters: Effect.Effect<FiltersResult, AdguardError>
    readonly rules: Effect.Effect<ListResult<string>, AdguardError>
    readonly dnsConfig: Effect.Effect<JsonObject, AdguardError>
    readonly dhcpStatus: Effect.Effect<DhcpStatus, AdguardError>
    readonly protectionToggle: (options: ProtectionToggleOptions) => Effect.Effect<ProtectionState, AdguardError>
  }
>()('@garage/adguard/services/AdguardApi') {}

const readRequiredString = (name: string): Effect.Effect<string, AdguardError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const AdguardConfigLive = Layer.succeed(AdguardConfig, {
  get: Effect.gen(function* () {
    const url = yield* readRequiredString('ADGUARD_URL')
    const username = yield* readRequiredString('ADGUARD_USERNAME')
    const password = yield* readRequiredString('ADGUARD_PASSWORD')
    return { url, username, password }
  }),
})
