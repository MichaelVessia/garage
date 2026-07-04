import { listResult, makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import { JsonObjectApi, PkiCaWire, RoutesConfig, Upstream } from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { CaddyError } from './errors.js'
import type { CaddyConfigValue } from './model.js'
import { CaddyApi, CaddyConfig } from './services.js'

const applyAuth = HttpClientRequest.setHeaders({ accept: 'application/json' })

const httpClientFor = (client: HttpClient.HttpClient, config: CaddyConfigValue) =>
  makeJsonClient<CaddyError>({
    client,
    baseUrl: config.url,
    applyAuth,
    errors: { httpError, unreachable, decodeError },
  })

export const CaddyApiLive = Layer.effect(
  CaddyApi,
  Effect.gen(function* () {
    const caddyConfig = yield* CaddyConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(f: (http: JsonClient<CaddyError>) => Effect.Effect<A, E>) =>
      caddyConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return CaddyApi.of({
      config: () => withConfig((http) => http.getJson('/config/', JsonObjectApi)),
      routes: () =>
        withConfig(
          Effect.fn('CaddyApi.routes.configured')(function* (http) {
            const result = yield* http.getJson('/config/', RoutesConfig)
            yield* Effect.annotateCurrentSpan({ 'caddy.route_count': result.count })
            return result
          })
        ),
      upstreams: () =>
        withConfig((http) =>
          http.getJson('/reverse_proxy/upstreams', Schema.Array(Upstream)).pipe(Effect.map(listResult))
        ),
      pkiCa: () => withConfig((http) => http.getJson('/pki/ca/local', PkiCaWire)),
      reload: (nextConfig) =>
        withConfig((http) =>
          http
            .requestStatus('post', '/load', { body: nextConfig })
            .pipe(Effect.map((httpStatus) => ({ reloaded: true, httpStatus })))
        ),
    })
  })
)
