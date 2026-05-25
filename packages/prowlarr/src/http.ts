import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ApplicationRecordSchema,
  CommandRecordSchema,
  HealthRecordSchema,
  HistoryResponseSchema,
  IndexerRecordSchema,
  IndexerStatsResponseSchema,
  ReleaseRecordSchema,
  StatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { ProwlarrError } from './errors.js'
import type { ProwlarrConfigValue, SearchOptions } from './model.js'
import { ProwlarrApi, ProwlarrConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: ProwlarrConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: ProwlarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': config.apiKey,
  })

const toDecodeError = (error: { readonly message: string }): ProwlarrError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ProwlarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ProwlarrError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ProwlarrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, ProwlarrError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ProwlarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ProwlarrError, RD> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, schema)
  })

const postIndexerTest = (
  client: HttpClient.HttpClient,
  config: ProwlarrConfigValue,
  indexerId: number,
  body: unknown
): Effect.Effect<
  { readonly indexerId: number; readonly passed: boolean; readonly httpStatus: number },
  ProwlarrError
> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, '/api/v1/indexer/test')).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status >= 200 && response.status < 300) {
      return { indexerId, passed: true, httpStatus: response.status }
    }

    if (response.status === 400) {
      return { indexerId, passed: false, httpStatus: response.status }
    }

    return yield* httpError(response.status)
  })

const searchParams = (
  query: string,
  options: SearchOptions
): ReadonlyArray<readonly [string, string | number | boolean]> => {
  const params: Array<readonly [string, string | number | boolean]> = [
    ['query', query],
    ['type', options.type ?? 'search'],
    ['limit', options.limit],
  ]

  if (options.protocol !== undefined) {
    params.push(['indexerIds', options.protocol === 'torrent' ? -2 : -1])
  }

  if (options.category !== undefined) {
    params.push(['categories', options.category])
  }

  return params
}

export const ProwlarrApiLive = Layer.effect(
  ProwlarrApi,
  Effect.gen(function* () {
    const prowlarrConfig = yield* ProwlarrConfig
    const config = yield* prowlarrConfig.get
    const client = yield* HttpClient.HttpClient

    return ProwlarrApi.of({
      status: getJson(client, config, '/api/v1/system/status', StatusSchema),
      health: getJson(client, config, '/api/v1/health', Schema.Array(HealthRecordSchema)),
      indexers: getJson(client, config, '/api/v1/indexer', Schema.Array(IndexerRecordSchema)),
      indexerStats: getJson(client, config, '/api/v1/indexerstats', IndexerStatsResponseSchema),
      search: (query, options) =>
        getJson(client, config, '/api/v1/search', Schema.Array(ReleaseRecordSchema), searchParams(query, options)),
      testIndexer: (indexerId) =>
        getJson(client, config, `/api/v1/indexer/${indexerId}`, Schema.Unknown).pipe(
          Effect.flatMap((indexer) => postIndexerTest(client, config, indexerId, indexer))
        ),
      applications: getJson(client, config, '/api/v1/applications', Schema.Array(ApplicationRecordSchema)),
      sync: postJson(client, config, '/api/v1/command', { name: 'ApplicationIndexerSync' }, CommandRecordSchema),
      history: (limit) =>
        getJson(client, config, '/api/v1/history', HistoryResponseSchema, [
          ['page', 1],
          ['pageSize', limit],
          ['sortKey', 'date'],
          ['sortDirection', 'descending'],
        ]),
    })
  })
)
