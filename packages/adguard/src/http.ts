import { Effect, Layer } from 'effect'
import type { Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ActiveClientsSchema,
  ClientsSchema,
  DhcpStatusSchema,
  FilteringRulesSchema,
  FilteringStatusSchema,
  JsonObjectSchema,
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
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}/control${path}`
    : `${normalizeBaseUrl(config.url)}/control${path}?${query}`
}

const withAuth =
  (config: AdguardConfigValue) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
    request.pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.basicAuth(config.username, config.password)
    )

const toDecodeError = (error: { readonly message: string }): AdguardError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AdguardError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AdguardError, RD> =>
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
): Effect.Effect<number, AdguardError> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

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

const postStatus = (
  client: HttpClient.HttpClient,
  config: AdguardConfigValue,
  path: string,
  body: unknown
): Effect.Effect<number, AdguardError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeStatus(client, request)
  })

export const AdguardApiLive = Layer.effect(
  AdguardApi,
  Effect.gen(function* () {
    const adguardConfig = yield* AdguardConfig
    const config = yield* adguardConfig.get
    const client = yield* HttpClient.HttpClient

    return AdguardApi.of({
      status: getJson(client, config, '/status', StatusSchema),
      version: getJson(client, config, '/status', VersionStatusSchema),
      stats: getJson(client, config, '/stats', StatsSchema),
      statsInfo: getJson(client, config, '/stats_info', StatsInfoSchema),
      queryLog: (options) => getJson(client, config, '/querylog', QueryLogResponseSchema, [['limit', options.limit]]),
      queryLogSearch: (options) =>
        getJson(client, config, '/querylog', QueryLogResponseSchema, [
          ['search', options.query],
          ['limit', options.limit],
        ]),
      clients: getJson(client, config, '/clients', ClientsSchema),
      clientsActive: (options) =>
        getJson(client, config, '/clients/find', ActiveClientsSchema, [['ip0', options.ip]]).pipe(
          Effect.map(listResult)
        ),
      filters: getJson(client, config, '/filtering/status', FilteringStatusSchema),
      rules: getJson(client, config, '/filtering/status', FilteringRulesSchema),
      dnsConfig: getJson(client, config, '/dns_info', JsonObjectSchema),
      dhcpStatus: getJson(client, config, '/dhcp/status', DhcpStatusSchema),
      protectionToggle: (options) =>
        postStatus(client, config, '/protection', { enabled: options.state === 'on', duration: 0 }).pipe(
          Effect.flatMap(() => getJson(client, config, '/status', ProtectionStateStatusSchema))
        ),
    })
  })
)
