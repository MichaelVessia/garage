import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const SonarrConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
  defaultQualityProfileId: Schema.Number,
})
export type SonarrConfigValue = typeof SonarrConfigValue.Type

export const SystemStatus = Schema.Struct({
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
export type SystemStatus = typeof SystemStatus.Type

export const RootFolder = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: OptionalNumber,
  accessible: OptionalBoolean,
  unmappedFolderCount: OptionalNumber,
})
export type RootFolder = typeof RootFolder.Type

export const QualityProfile = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  isDefault: OptionalBoolean,
  upgradeAllowed: OptionalBoolean,
  cutoff: OptionalNumber,
  minFormatScore: OptionalNumber,
  cutoffFormatScore: OptionalNumber,
})
export type QualityProfile = typeof QualityProfile.Type

export const SeriesLookupResult = Schema.Struct({
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
export type SeriesLookupResult = typeof SeriesLookupResult.Type

export const SeriesStatistics = Schema.Struct({
  seasonCount: OptionalNumber,
  episodeFileCount: OptionalNumber,
  episodeCount: OptionalNumber,
  totalEpisodeCount: OptionalNumber,
  sizeOnDisk: OptionalNumber,
  percentOfEpisodes: OptionalNumber,
})
export type SeriesStatistics = typeof SeriesStatistics.Type

export const SeriesRecord = Schema.Struct({
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
  statistics: Schema.optional(SeriesStatistics),
})
export type SeriesRecord = typeof SeriesRecord.Type

export const QueueRecord = Schema.Struct({
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
export type QueueRecord = typeof QueueRecord.Type

export const EpisodeRecord = Schema.Struct({
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
export type EpisodeRecord = typeof EpisodeRecord.Type

export const HistoryRecord = Schema.Struct({
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
export type HistoryRecord = typeof HistoryRecord.Type

export const ConfigSummary = Schema.Struct({
  rootFolders: Schema.Array(RootFolder),
  qualityProfiles: Schema.Array(QualityProfile),
})
export type ConfigSummary = typeof ConfigSummary.Type

export const SearchResult = Schema.Struct({
  query: Schema.String,
  count: Schema.Number,
  results: Schema.Array(SeriesLookupResult),
})
export type SearchResult = typeof SearchResult.Type

export const ExistsResult = Schema.Struct({
  tvdbId: Schema.Number,
  exists: Schema.Boolean,
  series: Schema.optional(SeriesRecord),
})
export type ExistsResult = typeof ExistsResult.Type

export const AddSeriesOptions = Schema.Struct({
  qualityProfileId: OptionalNumber,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesOptions = typeof AddSeriesOptions.Type

export const AddSeriesApiOptions = Schema.Struct({
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesApiOptions = typeof AddSeriesApiOptions.Type

export const AddSeriesResult = Schema.Struct({
  added: Schema.Boolean,
  series: SeriesRecord,
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMissingEpisodes: Schema.Boolean,
})
export type AddSeriesResult = typeof AddSeriesResult.Type

export const RemoveSeriesOptions = Schema.Struct({ deleteFiles: Schema.Boolean })
export type RemoveSeriesOptions = typeof RemoveSeriesOptions.Type

export const RemoveSeriesResult = Schema.Struct({
  removed: Schema.Boolean,
  tvdbId: Schema.Number,
  deleteFiles: Schema.Boolean,
})
export type RemoveSeriesResult = typeof RemoveSeriesResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const CalendarOptions = Schema.Struct({ days: Schema.Number })
export type CalendarOptions = typeof CalendarOptions.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const CalendarResult = Schema.Struct({
  days: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(EpisodeRecord),
})
export type CalendarResult = typeof CalendarResult.Type
