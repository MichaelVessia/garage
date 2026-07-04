import { makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

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

const applyAuth = (config: ProwlarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const httpClientFor = (client: HttpClient.HttpClient, config: ProwlarrConfigValue) =>
  makeJsonClient<ProwlarrError>({
    client,
    baseUrl: config.url,
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

const postIndexerTest = Effect.fn('prowlarr.postIndexerTest')(function* (
  http: JsonClient<ProwlarrError>,
  indexerId: number,
  body: unknown
): Effect.fn.Return<
  { readonly indexerId: number; readonly passed: boolean; readonly httpStatus: number },
  ProwlarrError
> {
  yield* Effect.annotateCurrentSpan({ 'prowlarr.indexer_id': indexerId })
  const httpStatus = yield* http.requestStatus('post', '/api/v1/indexer/test', { body }).pipe(
    Effect.tapError((failure) => Effect.logDebug('prowlarr indexer test rejected', { failure })),
    Effect.catchTag('ProwlarrHttpError', (failure) =>
      failure.status === 400 ? Effect.succeed(400) : Effect.fail(failure)
    )
  )
  return { indexerId, passed: httpStatus >= 200 && httpStatus < 300, httpStatus }
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
    const withConfig = <A, E>(f: (http: JsonClient<ProwlarrError>) => Effect.Effect<A, E>) =>
      prowlarrConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return ProwlarrApi.of({
      status: () => withConfig((http) => http.getJson('/api/v1/system/status', StatusSchema)),
      health: () => withConfig((http) => http.getJson('/api/v1/health', Schema.Array(HealthRecordSchema))),
      indexers: () => withConfig((http) => http.getJson('/api/v1/indexer', Schema.Array(IndexerRecordSchema))),
      indexerStats: () => withConfig((http) => http.getJson('/api/v1/indexerstats', IndexerStatsResponseSchema)),
      search: (query, options) =>
        withConfig((http) =>
          http.getJson('/api/v1/search', Schema.Array(ReleaseRecordSchema), searchParams(query, options))
        ),
      testIndexer: (indexerId) =>
        withConfig(
          Effect.fn('ProwlarrApi.testIndexer.configured')(function* (http) {
            const indexer = yield* http.getJson(`/api/v1/indexer/${indexerId}`, Schema.Unknown)
            return yield* postIndexerTest(http, indexerId, indexer)
          })
        ),
      applications: () =>
        withConfig((http) => http.getJson('/api/v1/applications', Schema.Array(ApplicationRecordSchema))),
      sync: () =>
        withConfig((http) => http.postJson('/api/v1/command', CommandRecordSchema, { name: 'ApplicationIndexerSync' })),
      history: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v1/history', HistoryResponseSchema, [
            ['page', 1],
            ['pageSize', limit],
            ['sortKey', 'date'],
            ['sortDirection', 'descending'],
          ])
        ),
    })
  })
)
