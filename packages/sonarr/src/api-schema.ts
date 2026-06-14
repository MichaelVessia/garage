import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  EpisodeRecord as DomainEpisodeRecord,
  HistoryRecord as DomainHistoryRecord,
  ListResultSchema as DomainListResultSchema,
  QualityProfile as DomainQualityProfile,
  QueueRecord as DomainQueueRecord,
  RootFolder as DomainRootFolder,
  SeriesLookupResult as DomainSeriesLookupResult,
  SeriesRecord as DomainSeriesRecord,
  SystemStatus as DomainSystemStatus,
} from './model.js'
import type { EpisodeRecord, HistoryRecord, ListResult, QueueRecord, RootFolder, SeriesLookupResult } from './model.js'

const StatusApi = Schema.Struct({
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

export const StatusSchema = StatusApi.pipe(Schema.decodeTo(DomainSystemStatus))

const RootFolderApi = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: Schema.optional(Schema.Number),
  accessible: Schema.optional(Schema.Boolean),
  unmappedFolders: Schema.Array(Schema.Unknown).pipe(Schema.optional),
})

const QualityProfileApi = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: Schema.optional(Schema.Boolean),
  cutoff: Schema.optional(Schema.Number),
  minFormatScore: Schema.optional(Schema.Number),
  cutoffFormatScore: Schema.optional(Schema.Number),
})

export const QualityProfileSchema = QualityProfileApi.pipe(Schema.decodeTo(DomainQualityProfile))

const LookupSeriesApi = Schema.Struct({
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  tvdbId: Schema.Number,
  titleSlug: Schema.optional(Schema.String),
  imdbId: Schema.optional(Schema.String),
  tmdbId: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
  genres: Schema.Array(Schema.String).pipe(Schema.optional),
  runtime: Schema.optional(Schema.Number),
  firstAired: Schema.optional(Schema.String),
  remotePoster: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
})

const SeriesStatistics = Schema.Struct({
  seasonCount: Schema.optional(Schema.Number),
  episodeFileCount: Schema.optional(Schema.Number),
  episodeCount: Schema.optional(Schema.Number),
  totalEpisodeCount: Schema.optional(Schema.Number),
  sizeOnDisk: Schema.optional(Schema.Number),
  percentOfEpisodes: Schema.optional(Schema.Number),
})

const SeriesRecordApi = Schema.Struct({
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
  statistics: Schema.optional(SeriesStatistics),
})

export const SeriesRecordSchema = SeriesRecordApi.pipe(Schema.decodeTo(DomainSeriesRecord))

const SeriesSummary = Schema.Struct({
  title: Schema.String,
  status: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
})

const EpisodeSummary = Schema.Struct({
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
})

const QualitySummary = Schema.Struct({
  quality: Schema.optional(Schema.Struct({ name: Schema.String })),
})

const Language = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})

const QueueStatusMessage = Schema.Struct({
  title: Schema.optional(Schema.String),
  messages: Schema.Array(Schema.String),
})

const QueueRecordApi = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  series: Schema.optional(SeriesSummary),
  seasonNumber: Schema.optional(Schema.Number),
  episode: Schema.optional(EpisodeSummary),
  status: Schema.String,
  trackedDownloadStatus: Schema.optional(Schema.String),
  trackedDownloadState: Schema.optional(Schema.String),
  statusMessages: Schema.Array(QueueStatusMessage).pipe(Schema.optional),
  errorMessage: Schema.optional(Schema.String),
  quality: Schema.optional(QualitySummary),
  languages: Schema.Array(Language).pipe(Schema.optional),
  size: Schema.optional(Schema.Number),
  sizeleft: Schema.optional(Schema.Number),
  timeleft: Schema.optional(Schema.String),
  estimatedCompletionTime: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.String),
  downloadClient: Schema.optional(Schema.String),
  indexer: Schema.optional(Schema.String),
  outputPath: Schema.optional(Schema.String),
})

const MissingRecordApi = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
  hasFile: Schema.optional(Schema.Boolean),
  monitored: Schema.optional(Schema.Boolean),
  lastSearchTime: Schema.optional(Schema.String),
  overview: Schema.optional(Schema.String),
  series: Schema.optional(SeriesSummary),
})

const EpisodeRecordApi = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String,
  seasonNumber: Schema.optional(Schema.Number),
  episodeNumber: Schema.optional(Schema.Number),
  airDateUtc: Schema.optional(Schema.String),
  hasFile: Schema.optional(Schema.Boolean),
  monitored: Schema.optional(Schema.Boolean),
  overview: Schema.optional(Schema.String),
  series: SeriesSummary,
})

const HistoryRecordApi = Schema.Struct({
  id: Schema.optional(Schema.Number),
  date: Schema.optional(Schema.String),
  eventType: Schema.String,
  sourceTitle: Schema.optional(Schema.String),
  episode: Schema.optional(EpisodeSummary),
  series: Schema.optional(SeriesSummary),
  quality: Schema.optional(QualitySummary),
  languages: Schema.Array(Language).pipe(Schema.optional),
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

const tvdbUrl = (tvdbId: number): string => `https://thetvdb.com/dereferrer/series/${tvdbId}`

const parseOptionalNumber = (value: Option.Option<string>): Option.Option<number> =>
  value.pipe(Option.map(Number), Option.filter(Number.isFinite))

const languageNames = (languages: Option.Option<ReadonlyArray<typeof Language.Type>>): ReadonlyArray<string> =>
  languages.pipe(
    Option.map(Arr.map((language) => language.name)),
    Option.getOrElse(() => [])
  )

const statusMessages = (
  messages: Option.Option<ReadonlyArray<typeof QueueStatusMessage.Type>>
): ReadonlyArray<string> =>
  messages.pipe(
    Option.map(Arr.flatMap((message) => message.messages)),
    Option.getOrElse(() => [])
  )

const lookupResultFromApi = (series: typeof LookupSeriesApi.Type): SeriesLookupResult => ({
  title: series.title,
  year: series.year,
  tvdbId: series.tvdbId,
  tvdbUrl: tvdbUrl(series.tvdbId),
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

const lookupResultToApi = (series: SeriesLookupResult): typeof LookupSeriesApi.Type => ({
  title: series.title,
  year: series.year,
  tvdbId: series.tvdbId,
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

export const LookupSeriesSchema = LookupSeriesApi.pipe(
  Schema.decodeTo(DomainSeriesLookupResult, {
    decode: SchemaGetter.transform(lookupResultFromApi),
    encode: SchemaGetter.transform(lookupResultToApi),
  })
)

const rootFolderFromApi = (folder: typeof RootFolderApi.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: folder.freeSpace,
  accessible: folder.accessible,
  unmappedFolderCount: folder.unmappedFolders?.length ?? 0,
})

const rootFolderToApi = (folder: RootFolder): typeof RootFolderApi.Type => ({
  id: folder.id,
  path: folder.path,
  freeSpace: folder.freeSpace,
  accessible: folder.accessible,
})

export const RootFolderSchema = RootFolderApi.pipe(
  Schema.decodeTo(DomainRootFolder, {
    decode: SchemaGetter.transform(rootFolderFromApi),
    encode: SchemaGetter.transform(rootFolderToApi),
  })
)

const queueEpisodeFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => ({
  ...(record.seasonNumber === undefined ? {} : { seasonNumber: record.seasonNumber }),
  ...(record.episode?.episodeNumber === undefined ? {} : { episodeNumber: record.episode.episodeNumber }),
  ...(record.episode?.title === undefined ? {} : { episodeTitle: record.episode.title }),
})

const queueStatusFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => ({
  ...(record.trackedDownloadStatus === undefined ? {} : { trackedDownloadStatus: record.trackedDownloadStatus }),
  ...(record.trackedDownloadState === undefined ? {} : { trackedDownloadState: record.trackedDownloadState }),
  statusMessages: statusMessages(Option.fromUndefinedOr(record.statusMessages)),
  // oxlint-disable-next-line effect/no-length-comparison -- errorMessage is a string; checking for an empty wire value, not an array
  ...(record.errorMessage === undefined || record.errorMessage.length === 0
    ? {}
    : { errorMessage: record.errorMessage }),
})

const queueTransferFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => ({
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  languages: languageNames(Option.fromUndefinedOr(record.languages)),
  ...(record.size === undefined ? {} : { size: record.size }),
  ...(record.sizeleft === undefined ? {} : { sizeleft: record.sizeleft }),
  ...(record.timeleft === undefined ? {} : { timeleft: record.timeleft }),
  ...(record.estimatedCompletionTime === undefined ? {} : { estimatedCompletionTime: record.estimatedCompletionTime }),
  ...(record.protocol === undefined ? {} : { protocol: record.protocol }),
  ...(record.downloadClient === undefined ? {} : { downloadClient: record.downloadClient }),
  ...(record.indexer === undefined ? {} : { indexer: record.indexer }),
  ...(record.outputPath === undefined ? {} : { outputPath: record.outputPath }),
})

const queueRecordFromApi = (record: typeof QueueRecordApi.Type): QueueRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  title: record.title,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...queueEpisodeFieldsFromApi(record),
  status: record.status,
  ...queueStatusFieldsFromApi(record),
  ...queueTransferFieldsFromApi(record),
})

const queueRecordToApi = (record: QueueRecord): typeof QueueRecordApi.Type => ({
  id: record.id,
  title: record.title,
  series: { title: record.seriesTitle },
  seasonNumber: record.seasonNumber,
  episode:
    record.episodeTitle === undefined
      ? undefined
      : { title: record.episodeTitle, seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber },
  status: record.status,
  trackedDownloadStatus: record.trackedDownloadStatus,
  trackedDownloadState: record.trackedDownloadState,
  statusMessages: record.statusMessages?.map((message) => ({ messages: [message] })),
  errorMessage: record.errorMessage,
  quality: record.quality === undefined ? undefined : { quality: { name: record.quality } },
  languages: record.languages?.map((name, id) => ({ id, name })),
  size: record.size,
  sizeleft: record.sizeleft,
  timeleft: record.timeleft,
  estimatedCompletionTime: record.estimatedCompletionTime,
  protocol: record.protocol,
  downloadClient: record.downloadClient,
  indexer: record.indexer,
  outputPath: record.outputPath,
})

const QueueRecordSchema = QueueRecordApi.pipe(
  Schema.decodeTo(DomainQueueRecord, {
    decode: SchemaGetter.transform(queueRecordFromApi),
    encode: SchemaGetter.transform(queueRecordToApi),
  })
)

const episodeRecordFromApi = (record: typeof EpisodeRecordApi.Type): EpisodeRecord => ({
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

const episodeRecordToApi = (record: EpisodeRecord): typeof EpisodeRecordApi.Type => ({
  id: record.id,
  title: record.title,
  seasonNumber: record.seasonNumber,
  episodeNumber: record.episodeNumber,
  airDateUtc: record.airDateUtc,
  hasFile: record.hasFile,
  monitored: record.monitored,
  overview: record.overview,
  series: { title: record.seriesTitle, status: record.seriesStatus, network: record.network },
})

export const EpisodeRecordSchema = EpisodeRecordApi.pipe(
  Schema.decodeTo(DomainEpisodeRecord, {
    decode: SchemaGetter.transform(episodeRecordFromApi),
    encode: SchemaGetter.transform(episodeRecordToApi),
  })
)

const missingRecordFromApi = (record: typeof MissingRecordApi.Type): EpisodeRecord => ({
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

const missingRecordToApi = (record: EpisodeRecord): typeof MissingRecordApi.Type => ({
  id: record.id,
  title: record.title,
  seasonNumber: record.seasonNumber,
  episodeNumber: record.episodeNumber,
  airDateUtc: record.airDateUtc,
  hasFile: record.hasFile,
  monitored: record.monitored,
  lastSearchTime: record.lastSearchTime,
  overview: record.overview,
  series: { title: record.seriesTitle, status: record.seriesStatus, network: record.network },
})

const MissingRecordSchema = MissingRecordApi.pipe(
  Schema.decodeTo(DomainEpisodeRecord, {
    decode: SchemaGetter.transform(missingRecordFromApi),
    encode: SchemaGetter.transform(missingRecordToApi),
  })
)

const historyEpisodeFieldsFromApi = (record: typeof HistoryRecordApi.Type): Partial<HistoryRecord> => ({
  ...(record.episode?.seasonNumber === undefined ? {} : { seasonNumber: record.episode.seasonNumber }),
  ...(record.episode?.episodeNumber === undefined ? {} : { episodeNumber: record.episode.episodeNumber }),
  ...(record.episode?.title === undefined ? {} : { episodeTitle: record.episode.title }),
})

const historyDataFieldsFromApi = (record: typeof HistoryRecordApi.Type): Partial<HistoryRecord> => {
  const size = parseOptionalNumber(Option.fromUndefinedOr(record.data?.size))

  return {
    ...(record.data?.downloadClientName === undefined && record.data?.downloadClient === undefined
      ? {}
      : { downloadClient: record.data.downloadClientName ?? record.data.downloadClient }),
    ...(record.data?.releaseGroup === undefined ? {} : { releaseGroup: record.data.releaseGroup }),
    ...Option.match(size, { onNone: () => ({}), onSome: (value) => ({ size: value }) }),
    ...(record.downloadId === undefined ? {} : { downloadId: record.downloadId }),
  }
}

const historyRecordFromApi = (record: typeof HistoryRecordApi.Type): HistoryRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  ...(record.date === undefined ? {} : { date: record.date }),
  eventType: record.eventType,
  ...(record.sourceTitle === undefined ? {} : { sourceTitle: record.sourceTitle }),
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...historyEpisodeFieldsFromApi(record),
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  languages: languageNames(Option.fromUndefinedOr(record.languages)),
  ...historyDataFieldsFromApi(record),
})

const historyRecordToApi = (record: HistoryRecord): typeof HistoryRecordApi.Type => ({
  id: record.id,
  date: record.date,
  eventType: record.eventType,
  sourceTitle: record.sourceTitle,
  series: { title: record.seriesTitle },
  episode:
    record.episodeTitle === undefined
      ? undefined
      : { title: record.episodeTitle, seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber },
  quality: record.quality === undefined ? undefined : { quality: { name: record.quality } },
  languages: record.languages?.map((name, id) => ({ id, name })),
  downloadId: record.downloadId,
  data: { downloadClient: record.downloadClient, releaseGroup: record.releaseGroup, size: record.size?.toString() },
})

const HistoryRecordSchema = HistoryRecordApi.pipe(
  Schema.decodeTo(DomainHistoryRecord, {
    decode: SchemaGetter.transform(historyRecordFromApi),
    encode: SchemaGetter.transform(historyRecordToApi),
  })
)

const QueueResponseApi = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(QueueRecordSchema),
})

const MissingResponseApi = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(MissingRecordSchema),
})

const HistoryResponseApi = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(HistoryRecordSchema),
})

const queueResponseFromApi = (response: typeof QueueResponseApi.Type): ListResult<QueueRecord> => ({
  count: response.records.length,
  totalRecords: response.totalRecords ?? response.records.length,
  records: response.records,
})

const queueResponseToApi = (result: ListResult<QueueRecord>): typeof QueueResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const QueueResponseSchema = QueueResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainQueueRecord), {
    decode: SchemaGetter.transform(queueResponseFromApi),
    encode: SchemaGetter.transform(queueResponseToApi),
  })
)

const missingResponseFromApi = (response: typeof MissingResponseApi.Type): ListResult<EpisodeRecord> => ({
  count: response.records.length,
  totalRecords: response.totalRecords ?? response.records.length,
  records: response.records,
})

const missingResponseToApi = (result: ListResult<EpisodeRecord>): typeof MissingResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const MissingResponseSchema = MissingResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainEpisodeRecord), {
    decode: SchemaGetter.transform(missingResponseFromApi),
    encode: SchemaGetter.transform(missingResponseToApi),
  })
)

const historyResponseFromApi = (response: typeof HistoryResponseApi.Type): ListResult<HistoryRecord> => ({
  count: response.records.length,
  totalRecords: response.totalRecords ?? response.records.length,
  records: response.records,
})

const historyResponseToApi = (result: ListResult<HistoryRecord>): typeof HistoryResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const HistoryResponseSchema = HistoryResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainHistoryRecord), {
    decode: SchemaGetter.transform(historyResponseFromApi),
    encode: SchemaGetter.transform(historyResponseToApi),
  })
)
