import { Effect, Layer, Redacted, Schema } from 'effect'
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
    'x-api-key': Redacted.value(config.apiKey),
  })

const toDecodeError = (error: { readonly message: string }): ProwlarrError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ProwlarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('prowlarr.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, ProwlarrError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

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

const postJson = Effect.fn('prowlarr.postJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ProwlarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, ProwlarrError, RD> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )

  return yield* executeJson(client, request, schema)
})

const postIndexerTest = Effect.fn('prowlarr.postIndexerTest')(function* (
  client: HttpClient.HttpClient,
  config: ProwlarrConfigValue,
  indexerId: number,
  body: unknown
): Effect.fn.Return<
  { readonly indexerId: number; readonly passed: boolean; readonly httpStatus: number },
  ProwlarrError
> {
  yield* Effect.annotateCurrentSpan({ 'prowlarr.indexer_id': indexerId })
  const request = yield* HttpClientRequest.post(endpoint(config, '/api/v1/indexer/test')).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

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
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: ProwlarrConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | ProwlarrError, R> => prowlarrConfig.get().pipe(Effect.flatMap(f))

    return ProwlarrApi.of({
      status: Effect.fn('ProwlarrApi.status')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/api/v1/system/status', StatusSchema))
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'status' })
      ),
      health: Effect.fn('ProwlarrApi.health')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/health', Schema.Array(HealthRecordSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'health' })
      ),
      indexers: Effect.fn('ProwlarrApi.indexers')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/indexer', Schema.Array(IndexerRecordSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'indexers' })
      ),
      indexerStats: Effect.fn('ProwlarrApi.indexerStats')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/indexerstats', IndexerStatsResponseSchema)
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'indexerStats' })
      ),
      search: Effect.fn('ProwlarrApi.search')(
        function* (query, options) {
          yield* Effect.annotateCurrentSpan({
            'prowlarr.query_length': query.length,
            'prowlarr.type': options.type ?? 'search',
            'prowlarr.limit': options.limit,
          })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/search', Schema.Array(ReleaseRecordSchema), searchParams(query, options))
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'search' })
      ),
      testIndexer: Effect.fn('ProwlarrApi.testIndexer')(
        function* (indexerId) {
          yield* Effect.annotateCurrentSpan({ 'prowlarr.indexer_id': indexerId })
          return yield* withConfig(
            Effect.fn('ProwlarrApi.testIndexer.configured')(function* (config) {
              const indexer = yield* getJson(client, config, `/api/v1/indexer/${indexerId}`, Schema.Unknown)
              return yield* postIndexerTest(client, config, indexerId, indexer)
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'testIndexer' })
      ),
      applications: Effect.fn('ProwlarrApi.applications')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/applications', Schema.Array(ApplicationRecordSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'applications' })
      ),
      sync: Effect.fn('ProwlarrApi.sync')(
        function* () {
          return yield* withConfig((config) =>
            postJson(client, config, '/api/v1/command', { name: 'ApplicationIndexerSync' }, CommandRecordSchema)
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'sync' })
      ),
      history: Effect.fn('ProwlarrApi.history')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'prowlarr.history_limit': limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v1/history', HistoryResponseSchema, [
              ['page', 1],
              ['pageSize', limit],
              ['sortKey', 'date'],
              ['sortDirection', 'descending'],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrApi', method: 'history' })
      ),
    })
  })
)
