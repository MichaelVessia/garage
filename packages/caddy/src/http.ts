import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { JsonObjectApi, PkiCaWire, RoutesConfig, Upstream } from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { CaddyError } from './errors.js'
import type { CaddyConfigValue, ListResult } from './model.js'
import { CaddyApi, CaddyConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const endpoint = (config: CaddyConfigValue, path: string): string => `${normalizeBaseUrl(config.url)}${path}`

const withJsonHeaders = HttpClientRequest.setHeaders({ accept: 'application/json' })

const toDecodeError = (error: { readonly message: string }): CaddyError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, CaddyError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('caddy.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, CaddyError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return yield* decodeBody(response, schema)
})

const executeStatus = Effect.fn('caddy.executeStatus')(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.fn.Return<number, CaddyError> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return response.status
})

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: CaddyConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, CaddyError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path)).pipe(withJsonHeaders), schema)

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({ count: records.length, records })

const postJsonStatus = Effect.fn('caddy.postJsonStatus')(function* (
  client: HttpClient.HttpClient,
  config: CaddyConfigValue,
  path: string,
  body: unknown
): Effect.fn.Return<number, CaddyError> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withJsonHeaders,
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )

  return yield* executeStatus(client, request)
})

export const CaddyApiLive = Layer.effect(
  CaddyApi,
  Effect.gen(function* () {
    const caddyConfig = yield* CaddyConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: CaddyConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | CaddyError, R> => caddyConfig.get().pipe(Effect.flatMap(f))

    return CaddyApi.of({
      config: () => withConfig((config) => getJson(client, config, '/config/', JsonObjectApi)),
      routes: () =>
        withConfig(
          Effect.fn('CaddyApi.routes.configured')(function* (config) {
            const result = yield* getJson(client, config, '/config/', RoutesConfig)
            yield* Effect.annotateCurrentSpan({ 'caddy.route_count': result.count })
            return result
          })
        ),
      upstreams: () =>
        withConfig((config) =>
          getJson(client, config, '/reverse_proxy/upstreams', Schema.Array(Upstream)).pipe(Effect.map(listResult))
        ),
      pkiCa: () => withConfig((config) => getJson(client, config, '/pki/ca/local', PkiCaWire)),
      reload: (nextConfig) =>
        withConfig((config) =>
          postJsonStatus(client, config, '/load', nextConfig).pipe(
            Effect.map((httpStatus) => ({ reloaded: true, httpStatus }))
          )
        ),
    })
  })
)
