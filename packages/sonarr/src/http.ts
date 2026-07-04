import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
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
  // oxlint-disable-next-line effect/no-length-comparison -- query is a string; checking for empty query string, not an array
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: SonarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const toDecodeError = (error: { readonly message: string }): SonarrError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SonarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('sonarr.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, SonarrError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

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

const postJson = Effect.fn('sonarr.postJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, SonarrError, RD> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
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
  ]).pipe(Effect.map((results) => Option.fromUndefinedOr(results[0])))
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
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: SonarrConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | SonarrError, R> => sonarrConfig.get().pipe(Effect.flatMap(f))

    return SonarrApi.of({
      status: () => withConfig((config) => getJson(client, config, '/api/v3/system/status', StatusSchema)),
      rootFolders: () =>
        withConfig((config) => getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema))),
      qualityProfiles: () =>
        withConfig((config) => getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema))),
      lookupSeries: (query) =>
        withConfig((config) =>
          getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', query]])
        ),
      lookupSeriesByTvdbId: (tvdbId) => withConfig((config) => lookupByTvdbId(client, config, tvdbId)),
      getSeriesByTvdbId: (tvdbId) =>
        withConfig((config) =>
          getJson(client, config, '/api/v3/series', Schema.Array(SeriesRecordSchema)).pipe(
            Effect.map((records) => Option.fromUndefinedOr(records.find((record) => record.tvdbId === tvdbId)))
          )
        ),
      addSeries: (lookup, options) =>
        withConfig((config) =>
          postJson(
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
        ),
      removeSeries: (seriesId, options) =>
        withConfig((config) =>
          deleteJson(client, config, `/api/v3/series/${seriesId}`, Schema.Unknown, [
            ['deleteFiles', options.deleteFiles],
          ]).pipe(Effect.asVoid)
        ),
      queue: (limit) =>
        withConfig((config) =>
          getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        ),
      calendar: (days) =>
        withConfig(
          Effect.fn('SonarrApi.calendar.configured')(function* (config) {
            const range = yield* currentCalendarRange(days)
            return yield* getJson(client, config, '/api/v3/calendar', Schema.Array(EpisodeRecordSchema), [
              ...range,
              ['includeSeries', true],
              ['unmonitored', false],
            ])
          })
        ),
      missing: (limit) =>
        withConfig((config) =>
          getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
          ])
        ),
      history: (limit) =>
        withConfig((config) =>
          getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        ),
    })
  })
)
