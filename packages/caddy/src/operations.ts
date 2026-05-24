import { Effect } from 'effect'

import type { CaddyError } from './errors.js'
import type { JsonObject, ListResult, PkiCa, ReloadResult, RouteSummary, UpstreamRecord } from './model.js'
import { CaddyApi, CaddyConfig } from './services.js'

const requireConfig = Effect.gen(function* () {
  const config = yield* CaddyConfig
  yield* config.get
})

export const config: Effect.Effect<JsonObject, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* CaddyApi
  return yield* api.config
})

export const routes: Effect.Effect<ListResult<RouteSummary>, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* CaddyApi
    return yield* api.routes
  }
)

export const upstreams: Effect.Effect<ListResult<UpstreamRecord>, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* CaddyApi
    return yield* api.upstreams
  }
)

export const pkiCa: Effect.Effect<PkiCa, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* CaddyApi
  return yield* api.pkiCa
})

export const reload = (nextConfig: JsonObject): Effect.Effect<ReloadResult, CaddyError, CaddyApi | CaddyConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* CaddyApi
    return yield* api.reload(nextConfig)
  })
