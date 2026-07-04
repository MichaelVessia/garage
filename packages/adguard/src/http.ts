import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import type * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ActiveClientsSchema,
  ClientsSchema,
  DhcpStatusSchema,
  FilteringRulesSchema,
  FilteringStatusSchema,
  JsonObjectApi,
  ProtectionStateStatusSchema,
  QueryLogResponseSchema,
  StatsInfoSchema,
  StatsSchema,
  StatusSchema,
  VersionStatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { AdguardError } from './errors.js'
import type { AdguardConfigValue, ListResult } from './model.js'
import { AdguardApi, AdguardConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: AdguardConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return Str.isEmpty(query)
    ? `${normalizeBaseUrl(config.url)}/control${path}`
    : `${normalizeBaseUrl(config.url)}/control${path}?${query}`
}

const withAuth =
  (config: AdguardConfigValue) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
    request.pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.basicAuth(config.username, Redacted.value(config.password))
    )

const toDecodeError = (error: { readonly message: string }): AdguardError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AdguardError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('adguard.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, AdguardError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return yield* decodeBody(response, schema)
})

const executeStatus = Effect.fn('adguard.executeStatus')(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.fn.Return<number, AdguardError> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return response.status
})

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: AdguardConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, AdguardError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({ count: records.length, records })

const postStatus = Effect.fn('adguard.postStatus')(function* (
  client: HttpClient.HttpClient,
  config: AdguardConfigValue,
  path: string,
  body: unknown
): Effect.fn.Return<number, AdguardError> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )

  return yield* executeStatus(client, request)
})

export const AdguardApiLive = Layer.effect(
  AdguardApi,
  Effect.gen(function* () {
    const adguardConfig = yield* AdguardConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: AdguardConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | AdguardError, R> => adguardConfig.get().pipe(Effect.flatMap(f))

    return AdguardApi.of({
      status: () => withConfig((config) => getJson(client, config, '/status', StatusSchema)),
      version: () => withConfig((config) => getJson(client, config, '/status', VersionStatusSchema)),
      stats: () => withConfig((config) => getJson(client, config, '/stats', StatsSchema)),
      statsInfo: () => withConfig((config) => getJson(client, config, '/stats_info', StatsInfoSchema)),
      queryLog: (options) =>
        withConfig((config) =>
          getJson(client, config, '/querylog', QueryLogResponseSchema, [['limit', options.limit]])
        ),
      queryLogSearch: (options) =>
        withConfig((config) =>
          getJson(client, config, '/querylog', QueryLogResponseSchema, [
            ['search', options.query],
            ['limit', options.limit],
          ])
        ),
      clients: () => withConfig((config) => getJson(client, config, '/clients', ClientsSchema)),
      clientsActive: (options) =>
        withConfig((config) =>
          getJson(client, config, '/clients/find', ActiveClientsSchema, [['ip0', options.ip]]).pipe(
            Effect.map(listResult)
          )
        ),
      filters: () => withConfig((config) => getJson(client, config, '/filtering/status', FilteringStatusSchema)),
      rules: () => withConfig((config) => getJson(client, config, '/filtering/status', FilteringRulesSchema)),
      dnsConfig: () => withConfig((config) => getJson(client, config, '/dns_info', JsonObjectApi)),
      dhcpStatus: () => withConfig((config) => getJson(client, config, '/dhcp/status', DhcpStatusSchema)),
      protectionToggle: (options) =>
        withConfig((config) =>
          postStatus(client, config, '/protection', {
            enabled: options.state === 'on',
            duration: 0,
          }).pipe(Effect.flatMap(() => getJson(client, config, '/status', ProtectionStateStatusSchema)))
        ),
    })
  })
)
