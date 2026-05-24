import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { decodeError, httpError, unreachable } from './errors.js'
import type { SonarrError } from './errors.js'
import type {
  EpisodeRecord,
  HistoryRecord,
  ListResult,
  QualityProfile,
  QueueRecord,
  RootFolder,
  SeriesLookupResult,
  SeriesRecord,
  SonarrConfigValue,
} from './model.js'
import { SonarrApi, SonarrConfig } from './services.js'

const StatusSchema = Schema.Struct({
  appName: Schema.String,
  version: Schema.String,
  instanceName: Schema.optional(Schema.String),
  runtimeVersion: Schema.optional(Schema.String),
  databaseVersion: Schema.optional(Schema.String),
  startupPath: Schema.optional(Schema.String),
  appData: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String),
  authentication: Schema.optional(Schema.String),
  startTime: Schema.optional(Schema.String),
  urlBase: Schema.optional(Schema.String),
  isDocker: Schema.optional(Schema.Boolean),
  branch: Schema.optional(Schema.String),
})

const RootFolderSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: Schema.optional(Schema.Number),
  accessible: Schema.optional(Schema.Boolean),
  unmappedFolders: Schema.optional(Schema.Array(Schema.Unknown)),
})

const QualityProfileSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: Schema.optional(Schema.Boolean),
  cutoff: Schema.optional(Schema.Number),
  minFormatScore: Schema.optional(Schema.Number),
  cutoffFormatScore: Schema.optional(Schema.Number),
})

const LookupSeriesSchema = Schema.Struct({
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  tvdbId: Schema.Number,
  titleSlug: Schema.optional(Schema.String),
  imdbId: Schema.optional(Schema.String),
  tmdbId: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
  genres: Schema.optional(Schema.Array(Schema.String)),
  runtime: Schema.optional(Schema.Number),
  firstAired: Schema.optional(Schema.String),
  remotePoster: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
})

const SeriesStatisticsSchema = Schema.Struct({
  seasonCount: Schema.optional(Schema.Number),
  episodeFileCount: Schema.optional(Schema.Number),
  episodeCount: Schema.optional(Schema.Number),
  totalEpisodeCount: Schema.optional(Schema.Number),
  sizeOnDisk: Schema.optional(Schema.Number),
  percentOfEpisodes: Schema.optional(Schema.Number),
})

const SeriesRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tvdbId: Schema.Number,
  year: Schema.optional(Schema.Number),
  path: Schema.optional(Schema.String),
  monitored: Schema.optional(Schema.Boolean),
  status: Schema.optional(Schema.String),
  qualityProfileId: Schema.optional(Schema.Number),
  network: Schema.optional(Schema.String),
  seasonFolder: Schema.optional(Schema.Boolean),
  seriesType: Schema.optional(Schema.String),
  statistics: Schema.optional(SeriesStatisticsSchema),
})

const SeriesSummarySchema = Schema.Struct({
  title: Schema.String,
  status: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
})

const EpisodeSummarySchema = Schema.Struct({
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
})

const QualitySummarySchema = Schema.Struct({
  quality: Schema.optional(Schema.Struct({ name: Schema.String })),
})

const LanguageSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})

const QueueStatusMessageSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  messages: Schema.Array(Schema.String),
})

const QueueRecordSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  series: Schema.optional(SeriesSummarySchema),
  seasonNumber: Schema.optional(Schema.Number),
  episode: Schema.optional(EpisodeSummarySchema),
  status: Schema.String,
  trackedDownloadStatus: Schema.optional(Schema.String),
  trackedDownloadState: Schema.optional(Schema.String),
  statusMessages: Schema.optional(Schema.Array(QueueStatusMessageSchema)),
  errorMessage: Schema.optional(Schema.String),
  quality: Schema.optional(QualitySummarySchema),
  languages: Schema.optional(Schema.Array(LanguageSchema)),
  size: Schema.optional(Schema.Number),
  sizeleft: Schema.optional(Schema.Number),
  timeleft: Schema.optional(Schema.String),
  estimatedCompletionTime: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.String),
  downloadClient: Schema.optional(Schema.String),
  indexer: Schema.optional(Schema.String),
  outputPath: Schema.optional(Schema.String),
})

const QueueResponseSchema = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(QueueRecordSchema),
})

const MissingRecordSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
  hasFile: Schema.optional(Schema.Boolean),
  monitored: Schema.optional(Schema.Boolean),
  lastSearchTime: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
  series: Schema.optional(SeriesSummarySchema),
})

const MissingResponseSchema = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(MissingRecordSchema),
})

const EpisodeRecordSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
  hasFile: Schema.optional(Schema.Boolean),
  monitored: Schema.optional(Schema.Boolean),
  overview: Schema.optional(Schema.String),
  series: SeriesSummarySchema,
})

const HistoryRecordSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  date: Schema.optional(Schema.String),
  eventType: Schema.String,
  sourceTitle: Schema.optional(Schema.String),
  episode: Schema.optional(EpisodeSummarySchema),
  series: Schema.optional(SeriesSummarySchema),
  quality: Schema.optional(QualitySummarySchema),
  languages: Schema.optional(Schema.Array(LanguageSchema)),
  downloadId: Schema.optional(Schema.String),
  data: Schema.optional(
    Schema.Struct({
      downloadClient: Schema.optional(Schema.String),
      downloadClientName: Schema.optional(Schema.String),
      releaseGroup: Schema.optional(Schema.String),
      size: Schema.optional(Schema.String),
    })
  ),
})

const HistoryResponseSchema = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(HistoryRecordSchema),
})

const toTvdbUrl = (tvdbId: number): string => `https://thetvdb.com/dereferrer/series/${tvdbId}`

const optionFromUndefined = <A>(value: A | undefined): Option.Option<A> =>
  value === undefined ? Option.none() : Option.some(value)

const parseOptionalNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const languageNames = (languages: ReadonlyArray<typeof LanguageSchema.Type> | undefined): ReadonlyArray<string> =>
  languages?.map((language) => language.name) ?? []

const statusMessages = (
  messages: ReadonlyArray<typeof QueueStatusMessageSchema.Type> | undefined
): ReadonlyArray<string> => messages?.flatMap((message) => message.messages) ?? []

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
  imdbId: series.imdbId,
  tmdbId: series.tmdbId,
  status: series.status,
  network: series.network,
  genres: series.genres,
  runtime: series.runtime,
  firstAired: series.firstAired,
  remotePoster: series.remotePoster,
  overview: series.overview,
})

const toSeriesRecord = (series: typeof SeriesRecordSchema.Type): SeriesRecord => ({
  id: series.id,
  title: series.title,
  tvdbId: series.tvdbId,
  year: series.year,
  path: series.path,
  monitored: series.monitored,
  status: series.status,
  qualityProfileId: series.qualityProfileId,
  network: series.network,
  seasonFolder: series.seasonFolder,
  seriesType: series.seriesType,
  statistics: series.statistics,
})

const toRootFolder = (folder: typeof RootFolderSchema.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: folder.freeSpace,
  accessible: folder.accessible,
  unmappedFolderCount: folder.unmappedFolders?.length ?? 0,
})

const toQualityProfile = (profile: typeof QualityProfileSchema.Type): QualityProfile => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: profile.upgradeAllowed,
  cutoff: profile.cutoff,
  minFormatScore: profile.minFormatScore,
  cutoffFormatScore: profile.cutoffFormatScore,
})

const toQueueEpisodeFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => ({
  ...(record.seasonNumber === undefined ? {} : { seasonNumber: record.seasonNumber }),
  ...(record.episode?.episodeNumber === undefined ? {} : { episodeNumber: record.episode.episodeNumber }),
  ...(record.episode?.title === undefined ? {} : { episodeTitle: record.episode.title }),
})

const toQueueStatusFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => ({
  ...(record.trackedDownloadStatus === undefined ? {} : { trackedDownloadStatus: record.trackedDownloadStatus }),
  ...(record.trackedDownloadState === undefined ? {} : { trackedDownloadState: record.trackedDownloadState }),
  statusMessages: statusMessages(record.statusMessages),
  ...(record.errorMessage === undefined || record.errorMessage.length === 0
    ? {}
    : { errorMessage: record.errorMessage }),
})

const toQueueTransferFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => ({
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  languages: languageNames(record.languages),
  ...(record.size === undefined ? {} : { size: record.size }),
  ...(record.sizeleft === undefined ? {} : { sizeleft: record.sizeleft }),
  ...(record.timeleft === undefined ? {} : { timeleft: record.timeleft }),
  ...(record.estimatedCompletionTime === undefined ? {} : { estimatedCompletionTime: record.estimatedCompletionTime }),
  ...(record.protocol === undefined ? {} : { protocol: record.protocol }),
  ...(record.downloadClient === undefined ? {} : { downloadClient: record.downloadClient }),
  ...(record.indexer === undefined ? {} : { indexer: record.indexer }),
  ...(record.outputPath === undefined ? {} : { outputPath: record.outputPath }),
})

const toQueueRecord = (record: typeof QueueRecordSchema.Type): QueueRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  title: record.title,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...toQueueEpisodeFields(record),
  status: record.status,
  ...toQueueStatusFields(record),
  ...toQueueTransferFields(record),
})

const toEpisodeRecord = (record: typeof EpisodeRecordSchema.Type): EpisodeRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  title: record.title,
  seriesTitle: record.series.title,
  ...(record.seasonNumber === undefined ? {} : { seasonNumber: record.seasonNumber }),
  ...(record.episodeNumber === undefined ? {} : { episodeNumber: record.episodeNumber }),
  ...(record.airDateUtc === undefined ? {} : { airDateUtc: record.airDateUtc }),
  ...(record.hasFile === undefined ? {} : { hasFile: record.hasFile }),
  ...(record.monitored === undefined ? {} : { monitored: record.monitored }),
  ...(record.series.status === undefined ? {} : { seriesStatus: record.series.status }),
  ...(record.series.network === undefined ? {} : { network: record.series.network }),
  ...(record.overview === undefined ? {} : { overview: record.overview }),
})

const toMissingRecord = (record: typeof MissingRecordSchema.Type): EpisodeRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  title: record.title,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...(record.seasonNumber === undefined ? {} : { seasonNumber: record.seasonNumber }),
  ...(record.episodeNumber === undefined ? {} : { episodeNumber: record.episodeNumber }),
  ...(record.airDateUtc === undefined ? {} : { airDateUtc: record.airDateUtc }),
  ...(record.hasFile === undefined ? {} : { hasFile: record.hasFile }),
  ...(record.monitored === undefined ? {} : { monitored: record.monitored }),
  ...(record.series?.status === undefined ? {} : { seriesStatus: record.series.status }),
  ...(record.series?.network === undefined ? {} : { network: record.series.network }),
  ...(record.lastSearchTime === undefined ? {} : { lastSearchTime: record.lastSearchTime }),
  ...(record.overview === undefined ? {} : { overview: record.overview }),
})

const toHistoryEpisodeFields = (record: typeof HistoryRecordSchema.Type): Partial<HistoryRecord> => ({
  ...(record.episode?.seasonNumber === undefined ? {} : { seasonNumber: record.episode.seasonNumber }),
  ...(record.episode?.episodeNumber === undefined ? {} : { episodeNumber: record.episode.episodeNumber }),
  ...(record.episode?.title === undefined ? {} : { episodeTitle: record.episode.title }),
})

const toHistoryDataFields = (record: typeof HistoryRecordSchema.Type): Partial<HistoryRecord> => {
  const size = parseOptionalNumber(record.data?.size)

  return {
    ...(record.data?.downloadClientName === undefined && record.data?.downloadClient === undefined
      ? {}
      : { downloadClient: record.data.downloadClientName ?? record.data.downloadClient }),
    ...(record.data?.releaseGroup === undefined ? {} : { releaseGroup: record.data.releaseGroup }),
    ...(size === undefined ? {} : { size }),
    ...(record.downloadId === undefined ? {} : { downloadId: record.downloadId }),
  }
}

const toHistoryRecord = (record: typeof HistoryRecordSchema.Type): HistoryRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  ...(record.date === undefined ? {} : { date: record.date }),
  eventType: record.eventType,
  ...(record.sourceTitle === undefined ? {} : { sourceTitle: record.sourceTitle }),
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...toHistoryEpisodeFields(record),
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  languages: languageNames(record.languages),
  ...toHistoryDataFields(record),
})

const toListResult = <Record>(
  response: { readonly totalRecords?: number | undefined; readonly records: ReadonlyArray<unknown> },
  records: ReadonlyArray<Record>
): ListResult<Record> => ({
  count: records.length,
  totalRecords: response.totalRecords ?? records.length,
  records,
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
      rootFolders: getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema)).pipe(
        Effect.map((folders) => folders.map(toRootFolder))
      ),
      qualityProfiles: getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema)).pipe(
        Effect.map((profiles) => profiles.map(toQualityProfile))
      ),
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
      queue: (limit) =>
        getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
          ['includeEpisode', true],
        ]).pipe(Effect.map((response) => toListResult(response, response.records.map(toQueueRecord)))),
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
      missing: (limit) =>
        getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
        ]).pipe(Effect.map((response) => toListResult(response, response.records.map(toMissingRecord)))),
      history: (limit) =>
        getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
          ['pageSize', limit],
          ['includeSeries', true],
          ['includeEpisode', true],
        ]).pipe(Effect.map((response) => toListResult(response, response.records.map(toHistoryRecord)))),
    })
  })
)
