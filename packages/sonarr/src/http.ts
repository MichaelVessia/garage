import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  EpisodeRecordSchema,
  HistoryResponseSchema,
  LookupSeriesSchema,
  MissingResponseSchema,
  QualityProfileSchema,
  QueueResponseSchema,
  RootFolderSchema,
  SeriesRecordSchema,
  StatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { SonarrError } from './errors.js'
import type { SeriesLookupResult, SonarrConfigValue } from './model.js'
import { SonarrApi, SonarrConfig } from './services.js'

const optionFromUndefined = <A>(value: A | undefined): Option.Option<A> =>
  value === undefined ? Option.none() : Option.some(value)

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: SonarrConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: SonarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': config.apiKey,
  })

const toDecodeError = (error: { readonly message: string }): SonarrError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SonarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SonarrError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, SonarrError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const deleteJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, SonarrError, RD> =>
  executeJson(client, HttpClientRequest.delete(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SonarrError, RD> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, schema)
  })

const lookupByTvdbId = Effect.fn('sonarr.lookupByTvdbId')(function* (
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  tvdbId: number
): Effect.fn.Return<Option.Option<SeriesLookupResult>, SonarrError> {
  yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
  return yield* getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [
    ['term', `tvdb:${tvdbId}`],
  ]).pipe(Effect.map((results) => optionFromUndefined(results[0])))
})

const currentCalendarRange = Effect.fn('sonarr.currentCalendarRange')(function* (
  days: number
): Effect.fn.Return<ReadonlyArray<readonly [string, string]>> {
  const now = yield* DateTime.now
  const end = now.pipe(DateTime.add({ days }))
  return [
    ['start', DateTime.formatIso(now)],
    ['end', DateTime.formatIso(end)],
  ]
})

export const SonarrApiLive = Layer.effect(
  SonarrApi,
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    const config = yield* sonarrConfig.get()
    const client = yield* HttpClient.HttpClient

    return SonarrApi.of({
      status: Effect.fn('SonarrApi.status')(
        function* () {
          return yield* getJson(client, config, '/api/v3/system/status', StatusSchema)
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'status' })
      ),
      rootFolders: Effect.fn('SonarrApi.rootFolders')(
        function* () {
          return yield* getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema))
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'rootFolders' })
      ),
      qualityProfiles: Effect.fn('SonarrApi.qualityProfiles')(
        function* () {
          return yield* getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema))
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'qualityProfiles' })
      ),
      lookupSeries: Effect.fn('SonarrApi.lookupSeries')(
        function* (query) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.query_length': query.length })
          return yield* getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [
            ['term', query],
          ])
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'lookupSeries' })
      ),
      lookupSeriesByTvdbId: Effect.fn('SonarrApi.lookupSeriesByTvdbId')(
        function* (tvdbId) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
          return yield* lookupByTvdbId(client, config, tvdbId)
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'lookupSeriesByTvdbId' })
      ),
      getSeriesByTvdbId: Effect.fn('SonarrApi.getSeriesByTvdbId')(
        function* (tvdbId) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
          const records = yield* getJson(client, config, '/api/v3/series', Schema.Array(SeriesRecordSchema))
          return optionFromUndefined(records.find((record) => record.tvdbId === tvdbId))
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'getSeriesByTvdbId' })
      ),
      addSeries: Effect.fn('SonarrApi.addSeries')(
        function* (lookup, options) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': lookup.tvdbId })
          return yield* postJson(
            client,
            config,
            '/api/v3/series',
            {
              title: lookup.title,
              titleSlug: lookup.titleSlug,
              tvdbId: lookup.tvdbId,
              qualityProfileId: options.qualityProfileId,
              rootFolderPath: options.rootFolderPath,
              monitored: true,
              addOptions: { searchForMissingEpisodes: options.searchForMissingEpisodes },
            },
            SeriesRecordSchema
          )
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'addSeries' })
      ),
      removeSeries: Effect.fn('SonarrApi.removeSeries')(
        function* (seriesId, options) {
          yield* Effect.annotateCurrentSpan({
            'sonarr.series_id': seriesId,
            'sonarr.delete_files': options.deleteFiles,
          })
          return yield* deleteJson(client, config, `/api/v3/series/${seriesId}`, Schema.Unknown, [
            ['deleteFiles', options.deleteFiles],
          ]).pipe(Effect.asVoid)
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'removeSeries' })
      ),
      queue: Effect.fn('SonarrApi.queue')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limit })
          return yield* getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'queue' })
      ),
      calendar: Effect.fn('SonarrApi.calendar')(
        function* (days) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.days': days })
          const range = yield* currentCalendarRange(days).pipe(Effect.withSpan('sonarr.currentCalendarRange'))
          return yield* getJson(client, config, '/api/v3/calendar', Schema.Array(EpisodeRecordSchema), [
            ...range,
            ['includeSeries', true],
            ['unmonitored', false],
          ])
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'calendar' })
      ),
      missing: Effect.fn('SonarrApi.missing')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limit })
          return yield* getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
          ])
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'missing' })
      ),
      history: Effect.fn('SonarrApi.history')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limit })
          return yield* getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        },
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrApi', method: 'history' })
      ),
    })
  })
)
