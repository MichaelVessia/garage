import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const SonarrConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.String,
  defaultQualityProfileId: Schema.Number,
})
export type SonarrConfigValue = typeof SonarrConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  appName: Schema.String,
  version: Schema.String,
  instanceName: OptionalString,
  runtimeVersion: OptionalString,
  databaseVersion: OptionalString,
  startupPath: OptionalString,
  appData: OptionalString,
  mode: OptionalString,
  authentication: OptionalString,
  startTime: OptionalString,
  urlBase: OptionalString,
  isDocker: OptionalBoolean,
  branch: OptionalString,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const RootFolderSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: OptionalNumber,
  accessible: OptionalBoolean,
  unmappedFolderCount: OptionalNumber,
})
export type RootFolder = typeof RootFolderSchema.Type

export const QualityProfileSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  isDefault: OptionalBoolean,
  upgradeAllowed: OptionalBoolean,
  cutoff: OptionalNumber,
  minFormatScore: OptionalNumber,
  cutoffFormatScore: OptionalNumber,
})
export type QualityProfile = typeof QualityProfileSchema.Type

export const SeriesLookupResultSchema = Schema.Struct({
  title: Schema.String,
  year: OptionalNumber,
  tvdbId: Schema.Number,
  tvdbUrl: Schema.String,
  titleSlug: OptionalString,
  imdbId: OptionalString,
  tmdbId: OptionalNumber,
  status: OptionalString,
  network: OptionalString,
  genres: OptionalStringArray,
  runtime: OptionalNumber,
  firstAired: OptionalString,
  remotePoster: OptionalString,
  overview: OptionalString,
})
export type SeriesLookupResult = typeof SeriesLookupResultSchema.Type

export const SeriesStatisticsSchema = Schema.Struct({
  seasonCount: OptionalNumber,
  episodeFileCount: OptionalNumber,
  episodeCount: OptionalNumber,
  totalEpisodeCount: OptionalNumber,
  sizeOnDisk: OptionalNumber,
  percentOfEpisodes: OptionalNumber,
})
export type SeriesStatistics = typeof SeriesStatisticsSchema.Type

export const SeriesRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tvdbId: Schema.Number,
  year: OptionalNumber,
  path: OptionalString,
  monitored: OptionalBoolean,
  status: OptionalString,
  qualityProfileId: OptionalNumber,
  qualityProfileName: OptionalString,
  network: OptionalString,
  seasonFolder: OptionalBoolean,
  seriesType: OptionalString,
  statistics: Schema.optional(SeriesStatisticsSchema),
})
export type SeriesRecord = typeof SeriesRecordSchema.Type

export const QueueRecordSchema = Schema.Struct({
  id: OptionalNumber,
  title: Schema.String,
  seriesTitle: Schema.String,
  seasonNumber: OptionalNumber,
  episodeNumber: OptionalNumber,
  episodeTitle: OptionalString,
  status: Schema.String,
  trackedDownloadStatus: OptionalString,
  trackedDownloadState: OptionalString,
  statusMessages: OptionalStringArray,
  errorMessage: OptionalString,
  quality: OptionalString,
  languages: OptionalStringArray,
  size: OptionalNumber,
  sizeleft: OptionalNumber,
  timeleft: OptionalString,
  estimatedCompletionTime: OptionalString,
  protocol: OptionalString,
  downloadClient: OptionalString,
  indexer: OptionalString,
  outputPath: OptionalString,
})
export type QueueRecord = typeof QueueRecordSchema.Type

export const EpisodeRecordSchema = Schema.Struct({
  id: OptionalNumber,
  title: Schema.String,
  seriesTitle: Schema.String,
  seasonNumber: OptionalNumber,
  episodeNumber: OptionalNumber,
  airDateUtc: OptionalString,
  hasFile: OptionalBoolean,
  monitored: OptionalBoolean,
  seriesStatus: OptionalString,
  network: OptionalString,
  lastSearchTime: OptionalString,
  overview: OptionalString,
})
export type EpisodeRecord = typeof EpisodeRecordSchema.Type

export const HistoryRecordSchema = Schema.Struct({
  id: OptionalNumber,
  date: OptionalString,
  eventType: Schema.String,
  sourceTitle: OptionalString,
  seriesTitle: Schema.String,
  seasonNumber: OptionalNumber,
  episodeNumber: OptionalNumber,
  episodeTitle: OptionalString,
  quality: OptionalString,
  languages: OptionalStringArray,
  downloadClient: OptionalString,
  releaseGroup: OptionalString,
  size: OptionalNumber,
  downloadId: OptionalString,
})
export type HistoryRecord = typeof HistoryRecordSchema.Type

export const ConfigSummarySchema = Schema.Struct({
  rootFolders: Schema.Array(RootFolderSchema),
  qualityProfiles: Schema.Array(QualityProfileSchema),
})
export type ConfigSummary = typeof ConfigSummarySchema.Type

export const SearchResultSchema = Schema.Struct({
  query: Schema.String,
  count: Schema.Number,
  results: Schema.Array(SeriesLookupResultSchema),
})
export type SearchResult = typeof SearchResultSchema.Type

export const ExistsResultSchema = Schema.Struct({
  tvdbId: Schema.Number,
  exists: Schema.Boolean,
  series: Schema.optional(SeriesRecordSchema),
})
export type ExistsResult = typeof ExistsResultSchema.Type

export const AddSeriesOptionsSchema = Schema.Struct({
  qualityProfileId: OptionalNumber,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesOptions = typeof AddSeriesOptionsSchema.Type

export const AddSeriesApiOptionsSchema = Schema.Struct({
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesApiOptions = typeof AddSeriesApiOptionsSchema.Type

export const AddSeriesResultSchema = Schema.Struct({
  added: Schema.Boolean,
  series: SeriesRecordSchema,
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesResult = typeof AddSeriesResultSchema.Type

export const RemoveSeriesOptionsSchema = Schema.Struct({ deleteFiles: Schema.Boolean })
export type RemoveSeriesOptions = typeof RemoveSeriesOptionsSchema.Type

export const RemoveSeriesResultSchema = Schema.Struct({
  removed: Schema.Boolean,
  tvdbId: Schema.Number,
  deleteFiles: Schema.Boolean,
})
export type RemoveSeriesResult = typeof RemoveSeriesResultSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const CalendarOptionsSchema = Schema.Struct({ days: Schema.Number })
export type CalendarOptions = typeof CalendarOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const CalendarResultSchema = Schema.Struct({
  days: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(EpisodeRecordSchema),
})
export type CalendarResult = typeof CalendarResultSchema.Type
