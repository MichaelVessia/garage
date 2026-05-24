import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { decodeError, httpError, unreachable } from './errors.js'
import type { SonarrError } from './errors.js'
import type {
  EpisodeRecord,
  HistoryRecord,
  QueueRecord,
  SeriesLookupResult,
  SeriesRecord,
  SonarrConfigValue,
} from './model.js'
import { SonarrApi, SonarrConfig } from './services.js'

const StatusSchema = Schema.Struct({
  appName: Schema.String,
  version: Schema.String,
})

const RootFolderSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: Schema.optional(Schema.Number),
})

const QualityProfileSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})

const LookupSeriesSchema = Schema.Struct({
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  tvdbId: Schema.Number,
  titleSlug: Schema.optional(Schema.String),
})

const SeriesRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tvdbId: Schema.Number,
  year: Schema.optional(Schema.Number),
})

const QueueRecordSchema = Schema.Struct({
  title: Schema.String,
  series: Schema.optional(Schema.Struct({ title: Schema.String })),
  status: Schema.String,
})

const QueueResponseSchema = Schema.Struct({
  records: Schema.Array(QueueRecordSchema),
})

const EpisodeRecordSchema = Schema.Struct({
  title: Schema.String,
  airDateUtc: Schema.optional(Schema.String),
  series: Schema.Struct({ title: Schema.String }),
})

const HistoryRecordSchema = Schema.Struct({
  eventType: Schema.String,
  sourceTitle: Schema.optional(Schema.String),
  episode: Schema.optional(Schema.Struct({ title: Schema.String, airDateUtc: Schema.optional(Schema.String) })),
  series: Schema.optional(Schema.Struct({ title: Schema.String })),
})

const HistoryResponseSchema = Schema.Struct({
  records: Schema.Array(HistoryRecordSchema),
})

const toTvdbUrl = (tvdbId: number): string => `https://thetvdb.com/dereferrer/series/${tvdbId}`

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

const toLookupResult = (series: typeof LookupSeriesSchema.Type): SeriesLookupResult => ({
  title: series.title,
  year: series.year,
  tvdbId: series.tvdbId,
  tvdbUrl: toTvdbUrl(series.tvdbId),
  titleSlug: series.titleSlug,
})

const toSeriesRecord = (series: typeof SeriesRecordSchema.Type): SeriesRecord => ({
  id: series.id,
  title: series.title,
  tvdbId: series.tvdbId,
  year: series.year,
})

const toQueueRecord = (record: typeof QueueRecordSchema.Type): QueueRecord => ({
  title: record.title,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  status: record.status,
})

const toEpisodeRecord = (record: typeof EpisodeRecordSchema.Type): EpisodeRecord => ({
  title: record.title,
  seriesTitle: record.series.title,
  airDateUtc: record.airDateUtc,
})

const toHistoryRecord = (record: typeof HistoryRecordSchema.Type): HistoryRecord => ({
  title: record.episode?.title ?? record.sourceTitle ?? record.eventType,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  eventType: record.eventType,
})

const lookupByTvdbId = (
  client: HttpClient.HttpClient,
  config: SonarrConfigValue,
  tvdbId: number
): Effect.Effect<Option.Option<SeriesLookupResult>, SonarrError> =>
  getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', `tvdb:${tvdbId}`]]).pipe(
    Effect.map((results) => optionFromUndefined(results[0]).pipe(Option.map(toLookupResult)))
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
        getJson(client, config, '/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', query]]).pipe(
          Effect.map((results) => results.map(toLookupResult))
        ),
      lookupSeriesByTvdbId: (tvdbId) => lookupByTvdbId(client, config, tvdbId),
      getSeriesByTvdbId: (tvdbId) =>
        getJson(client, config, '/api/v3/series', Schema.Array(SeriesRecordSchema)).pipe(
          Effect.map((records) =>
            optionFromUndefined(records.find((record) => record.tvdbId === tvdbId)).pipe(Option.map(toSeriesRecord))
          )
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
        ).pipe(Effect.map(toSeriesRecord)),
      removeSeries: (seriesId, options) =>
        deleteJson(client, config, `/api/v3/series/${seriesId}`, Schema.Unknown, [
          ['deleteFiles', options.deleteFiles],
        ]).pipe(Effect.asVoid),
      queue: getJson(client, config, '/api/v3/queue', QueueResponseSchema).pipe(
        Effect.map((response) => response.records.map(toQueueRecord))
      ),
      calendar: (days) =>
        currentCalendarRange(days).pipe(
          Effect.flatMap((range) =>
            getJson(client, config, '/api/v3/calendar', Schema.Array(EpisodeRecordSchema), [
              ...range,
              ['includeSeries', true],
              ['unmonitored', false],
            ])
          ),
          Effect.map((records) => records.map(toEpisodeRecord))
        ),
      missing: getJson(client, config, '/api/v3/wanted/missing', QueueResponseSchema).pipe(
        Effect.map((response) =>
          response.records.map((record) => ({
            title: record.title,
            seriesTitle: record.series?.title ?? 'Unknown Series',
          }))
        )
      ),
      history: (limit) =>
        getJson(client, config, '/api/v3/history', HistoryResponseSchema, [['pageSize', limit]]).pipe(
          Effect.map((response) => response.records.map(toHistoryRecord))
        ),
    })
  })
)
