import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { JsonObjectSchema, PkiCaSchema, RoutesConfigSchema, UpstreamSchema } from './api-schema.js'
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

const toDecodeError = (error: { readonly message: string }): CaddyError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, CaddyError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, CaddyError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const executeStatus = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<number, CaddyError> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

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

const postJsonStatus = (
  client: HttpClient.HttpClient,
  config: CaddyConfigValue,
  path: string,
  body: unknown
): Effect.Effect<number, CaddyError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withJsonHeaders,
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeStatus(client, request)
  })

export const CaddyApiLive = Layer.effect(
  CaddyApi,
  Effect.gen(function* () {
    const caddyConfig = yield* CaddyConfig
    const config = yield* caddyConfig.get
    const client = yield* HttpClient.HttpClient

    return CaddyApi.of({
      config: getJson(client, config, '/config/', JsonObjectSchema),
      routes: getJson(client, config, '/config/', RoutesConfigSchema),
      upstreams: getJson(client, config, '/reverse_proxy/upstreams', Schema.Array(UpstreamSchema)).pipe(
        Effect.map(listResult)
      ),
      pkiCa: getJson(client, config, '/pki/ca/local', PkiCaSchema),
      reload: (nextConfig) =>
        postJsonStatus(client, config, '/load', nextConfig).pipe(
          Effect.map((httpStatus) => ({ reloaded: true, httpStatus }))
        ),
    })
  })
)
