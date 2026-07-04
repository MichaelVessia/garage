import { makeConfigReaders } from '@garage/cli-protocol'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

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

const { readRequiredString } = makeConfigReaders(envMissing)

export const CaddyConfigLive = Layer.effect(
  CaddyConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(
      readRequiredString('CADDY_URL').pipe(
        Effect.map((url) => ({ url })),
        Effect.withSpan('CaddyConfig.get'),
        Effect.annotateLogs({ package: '@garage/caddy', service: 'CaddyConfig', method: 'get' })
      )
    )
    return CaddyConfig.of({ get: () => cachedGet })
  })
)
