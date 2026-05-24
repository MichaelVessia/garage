import { Schema } from 'effect'

import type {
  EpisodeRecord,
  HistoryRecord,
  ListResult,
  QualityProfile,
  QueueRecord,
  RootFolder,
  SeriesLookupResult,
  SeriesRecord,
} from './model.js'

export const StatusSchema = Schema.Struct({
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

export const RootFolderSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: Schema.optional(Schema.Number),
  accessible: Schema.optional(Schema.Boolean),
  unmappedFolders: Schema.optional(Schema.Array(Schema.Unknown)),
})

export const QualityProfileSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: Schema.optional(Schema.Boolean),
  cutoff: Schema.optional(Schema.Number),
  minFormatScore: Schema.optional(Schema.Number),
  cutoffFormatScore: Schema.optional(Schema.Number),
})

export const LookupSeriesSchema = Schema.Struct({
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

export const SeriesRecordSchema = Schema.Struct({
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

export const QueueResponseSchema = Schema.Struct({
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

export const MissingResponseSchema = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(MissingRecordSchema),
})

export const EpisodeRecordSchema = Schema.Struct({
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

export const HistoryRecordSchema = Schema.Struct({
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

export const HistoryResponseSchema = Schema.Struct({
  totalRecords: Schema.optional(Schema.Number),
  records: Schema.Array(HistoryRecordSchema),
})

const toTvdbUrl = (tvdbId: number): string => `https://thetvdb.com/dereferrer/series/${tvdbId}`

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

export const toLookupResult = (series: typeof LookupSeriesSchema.Type): SeriesLookupResult => ({
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

export const toSeriesRecord = (series: typeof SeriesRecordSchema.Type): SeriesRecord => ({
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

export const toRootFolder = (folder: typeof RootFolderSchema.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: folder.freeSpace,
  accessible: folder.accessible,
  unmappedFolderCount: folder.unmappedFolders?.length ?? 0,
})

export const toQualityProfile = (profile: typeof QualityProfileSchema.Type): QualityProfile => ({
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

export const toQueueRecord = (record: typeof QueueRecordSchema.Type): QueueRecord => ({
  ...(record.id === undefined ? {} : { id: record.id }),
  title: record.title,
  seriesTitle: record.series?.title ?? 'Unknown Series',
  ...toQueueEpisodeFields(record),
  status: record.status,
  ...toQueueStatusFields(record),
  ...toQueueTransferFields(record),
})

export const toEpisodeRecord = (record: typeof EpisodeRecordSchema.Type): EpisodeRecord => ({
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

export const toMissingRecord = (record: typeof MissingRecordSchema.Type): EpisodeRecord => ({
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

export const toHistoryRecord = (record: typeof HistoryRecordSchema.Type): HistoryRecord => ({
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

export const toListResult = <Record>(
  response: { readonly totalRecords?: number | undefined; readonly records: ReadonlyArray<unknown> },
  records: ReadonlyArray<Record>
): ListResult<Record> => ({
  count: records.length,
  totalRecords: response.totalRecords ?? records.length,
  records,
})
