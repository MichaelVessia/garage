import { Config, Context, Effect, Layer } from 'effect'

import { envMissing } from './errors.js'
import type { CaddyError } from './errors.js'
import type {
  CaddyConfigValue,
  JsonObject,
  ListResult,
  PkiCa,
  ReloadResult,
  RouteSummary,
  UpstreamRecord,
} from './model.js'

export class CaddyConfig extends Context.Service<
  CaddyConfig,
  { readonly get: () => Effect.Effect<CaddyConfigValue, CaddyError> }
>()('@garage/caddy/services/CaddyConfig') {}

export class CaddyApi extends Context.Service<
  CaddyApi,
  {
    readonly config: () => Effect.Effect<JsonObject, CaddyError>
    readonly routes: () => Effect.Effect<ListResult<RouteSummary>, CaddyError>
    readonly upstreams: () => Effect.Effect<ListResult<UpstreamRecord>, CaddyError>
    readonly pkiCa: () => Effect.Effect<PkiCa, CaddyError>
    readonly reload: (config: JsonObject) => Effect.Effect<ReloadResult, CaddyError>
  }
>()('@garage/caddy/services/CaddyApi') {}

const readRequiredString = (name: string): Effect.Effect<string, CaddyError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const CaddyConfigLive = Layer.effect(
  CaddyConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(
      Effect.gen(function* () {
        const url = yield* readRequiredString('CADDY_URL')
        return { url }
      }).pipe(
        Effect.withSpan('CaddyConfig.get'),
        Effect.annotateLogs({ package: '@garage/caddy', service: 'CaddyConfig', method: 'get' })
      )
    )
    return CaddyConfig.of({ get: () => cachedGet })
  })
)
