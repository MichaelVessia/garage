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

const lookupByTvdbId = (
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  tvdbId: number
): Effect.Effect<Option.Option<SeriesLookupResult>, SonarrError> =>
  getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', `tvdb:${tvdbId}`]]).pipe(
    Effect.map((results) => optionFromUndefined(results[0]))
  )

const currentCalendarRange = (days: number): Effect.Effect<ReadonlyArray<readonly [string, string]>> =>
  DateTime.now.pipe(
    Effect.map((now) => {
      const end = now.pipe(DateTime.add({ days }))
      return [
        ['start', DateTime.formatIso(now)],
        ['end', DateTime.formatIso(end)],
      ]
    })
  )

export const SonarrApiLive = Layer.effect(
  SonarrApi,
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    const config = yield* sonarrConfig.get
    const client = yield* HttpClient.HttpClient

    return SonarrApi.of({
      status: getJson(client, config, '/api/v3/system/status', StatusSchema),
      rootFolders: getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema)),
      qualityProfiles: getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema)),
      lookupSeries: (query) =>
        getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', query]]),
      lookupSeriesByTvdbId: (tvdbId) => lookupByTvdbId(client, config, tvdbId),
      getSeriesByTvdbId: (tvdbId) =>
        getJson(client, config, '/api/v3/series', Schema.Array(SeriesRecordSchema)).pipe(
          Effect.map((records) => optionFromUndefined(records.find((record) => record.tvdbId === tvdbId)))
        ),
      addSeries: (lookup, options) =>
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
        ),
      removeSeries: (seriesId, options) =>
        deleteJson(client, config, `/api/v3/series/${seriesId}`, Schema.Unknown, [
          ['deleteFiles', options.deleteFiles],
        ]).pipe(Effect.asVoid),
      queue: (limit) =>
        getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
          ['includeEpisode', true],
        ]),
      calendar: (days) =>
        currentCalendarRange(days).pipe(
          Effect.flatMap((range) =>
            getJson(client, config, '/api/v3/calendar', Schema.Array(EpisodeRecordSchema), [
              ...range,
              ['includeSeries', true],
              ['unmonitored', false],
            ])
          )
        ),
      missing: (limit) =>
        getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
        ]),
      history: (limit) =>
        getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
          ['includeEpisode', true],
        ]),
    })
  })
)
