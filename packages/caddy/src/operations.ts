import * as Effect from 'effect/Effect'

import type { CaddyError } from './errors.js'
import type { JsonObject, ListResult, PkiCa, ReloadResult, RouteSummary, UpstreamRecord } from './model.js'
import { CaddyApi } from './services.js'
import type { CaddyConfig } from './services.js'

export const config: Effect.Effect<JsonObject, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(function* () {
  const api = yield* CaddyApi
  return yield* api.config()
}).pipe(Effect.withSpan('caddy.config'), Effect.annotateLogs({ package: '@garage/caddy', operation: 'config' }))

export const routes: Effect.Effect<ListResult<RouteSummary>, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(
  function* () {
    const api = yield* CaddyApi
    const result = yield* api.routes()
    yield* Effect.annotateCurrentSpan({ 'caddy.route_count': result.count })
    return result
  }
).pipe(Effect.withSpan('caddy.routes'), Effect.annotateLogs({ package: '@garage/caddy', operation: 'routes' }))

export const upstreams: Effect.Effect<ListResult<UpstreamRecord>, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(
  function* () {
    const api = yield* CaddyApi
    return yield* api.upstreams()
  }
).pipe(Effect.withSpan('caddy.upstreams'), Effect.annotateLogs({ package: '@garage/caddy', operation: 'upstreams' }))

export const pkiCa: Effect.Effect<PkiCa, CaddyError, CaddyApi | CaddyConfig> = Effect.gen(function* () {
  const api = yield* CaddyApi
  return yield* api.pkiCa()
}).pipe(Effect.withSpan('caddy.pkiCa'), Effect.annotateLogs({ package: '@garage/caddy', operation: 'pkiCa' }))

export const reload = Effect.fn('caddy.reload')(
  function* (nextConfig: JsonObject): Effect.fn.Return<ReloadResult, CaddyError, CaddyApi | CaddyConfig> {
    const api = yield* CaddyApi
    return yield* api.reload(nextConfig)
  },
  Effect.annotateLogs({ package: '@garage/caddy', operation: 'reload' })
)
