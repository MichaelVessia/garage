import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const RadarrConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
  defaultQualityProfileId: Schema.Number,
})
export type RadarrConfigValue = typeof RadarrConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  appName: OptionalString,
  version: Schema.String,
  instanceName: OptionalString,
  branch: OptionalString,
  runtimeVersion: OptionalString,
  startupPath: OptionalString,
  appData: OptionalString,
  osName: OptionalString,
  osVersion: OptionalString,
  isLinux: OptionalBoolean,
  isDocker: OptionalBoolean,
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

export const MovieCollectionSummarySchema = Schema.Struct({
  tmdbId: Schema.Number,
  title: Schema.String,
})
export type MovieCollectionSummary = typeof MovieCollectionSummarySchema.Type

export const MovieLookupResultSchema = Schema.Struct({
  title: Schema.String,
  year: OptionalNumber,
  tmdbId: Schema.Number,
  tmdbUrl: Schema.String,
  titleSlug: OptionalString,
  imdbId: OptionalString,
  status: OptionalString,
  overview: OptionalString,
  runtime: OptionalNumber,
  certification: OptionalString,
  genres: OptionalStringArray,
  studio: OptionalString,
  inCinemas: OptionalString,
  physicalRelease: OptionalString,
  digitalRelease: OptionalString,
  remotePoster: OptionalString,
  collection: Schema.optional(MovieCollectionSummarySchema),
})
export type MovieLookupResult = typeof MovieLookupResultSchema.Type

export const MovieRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  year: OptionalNumber,
  tmdbId: Schema.Number,
  path: OptionalString,
  monitored: OptionalBoolean,
  status: OptionalString,
  hasFile: OptionalBoolean,
  qualityProfileId: OptionalNumber,
  qualityProfileName: OptionalString,
  minimumAvailability: OptionalString,
  isAvailable: OptionalBoolean,
  sizeOnDisk: OptionalNumber,
  inCinemas: OptionalString,
  physicalRelease: OptionalString,
  digitalRelease: OptionalString,
  added: OptionalString,
  studio: OptionalString,
  runtime: OptionalNumber,
  certification: OptionalString,
  genres: OptionalStringArray,
})
export type MovieRecord = typeof MovieRecordSchema.Type

export const MovieReleaseRecordSchema = Schema.Struct({
  id: OptionalNumber,
  title: Schema.String,
  year: OptionalNumber,
  tmdbId: OptionalNumber,
  inCinemas: OptionalString,
  physicalRelease: OptionalString,
  digitalRelease: OptionalString,
  hasFile: OptionalBoolean,
  monitored: OptionalBoolean,
  status: OptionalString,
  isAvailable: OptionalBoolean,
})
export type MovieReleaseRecord = typeof MovieReleaseRecordSchema.Type

export const QueueRecordSchema = Schema.Struct({
  id: OptionalNumber,
  title: Schema.String,
  movieTitle: OptionalString,
  year: OptionalNumber,
  status: Schema.String,
  trackedDownloadStatus: OptionalString,
  trackedDownloadState: OptionalString,
  statusMessages: OptionalStringArray,
  errorMessage: OptionalString,
  quality: OptionalString,
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

export const HistoryRecordSchema = Schema.Struct({
  id: OptionalNumber,
  date: OptionalString,
  eventType: Schema.String,
  sourceTitle: OptionalString,
  movieTitle: OptionalString,
  year: OptionalNumber,
  quality: OptionalString,
  downloadClient: OptionalString,
  releaseGroup: OptionalString,
  size: OptionalNumber,
  downloadId: OptionalString,
})
export type HistoryRecord = typeof HistoryRecordSchema.Type

export const CollectionRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tmdbId: Schema.Number,
  monitored: OptionalBoolean,
  searchOnAdd: OptionalBoolean,
})
export type CollectionRecord = typeof CollectionRecordSchema.Type

export const ConfigSummarySchema = Schema.Struct({
  rootFolders: Schema.Array(RootFolderSchema),
  qualityProfiles: Schema.Array(QualityProfileSchema),
})
export type ConfigSummary = typeof ConfigSummarySchema.Type

export const SearchResultSchema = Schema.Struct({
  query: Schema.String,
  count: Schema.Number,
  results: Schema.Array(MovieLookupResultSchema),
})
export type SearchResult = typeof SearchResultSchema.Type

export const ExistsResultSchema = Schema.Struct({
  tmdbId: Schema.Number,
  exists: Schema.Boolean,
  movie: Schema.optional(MovieRecordSchema),
})
export type ExistsResult = typeof ExistsResultSchema.Type

export const AddMovieOptionsSchema = Schema.Struct({
  qualityProfileId: OptionalNumber,
  searchForMovie: Schema.Boolean,
})
export type AddMovieOptions = typeof AddMovieOptionsSchema.Type

export const AddMovieApiOptionsSchema = Schema.Struct({
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMovie: Schema.Boolean,
})
export type AddMovieApiOptions = typeof AddMovieApiOptionsSchema.Type

export const AddMovieResultSchema = Schema.Struct({
  added: Schema.Boolean,
  movie: MovieRecordSchema,
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMovie: Schema.Boolean,
})
export type AddMovieResult = typeof AddMovieResultSchema.Type

export const AddCollectionOptionsSchema = Schema.Struct({
  searchForMovies: Schema.Boolean,
  resultLimit: Schema.Number,
})
export type AddCollectionOptions = typeof AddCollectionOptionsSchema.Type

export const AddCollectionMovieActionSchema = Schema.Literals(['added', 'skipped', 'failed'])
export type AddCollectionMovieAction = typeof AddCollectionMovieActionSchema.Type

export const AddCollectionMovieResultSchema = Schema.Struct({
  action: AddCollectionMovieActionSchema,
  tmdbId: Schema.Number,
  title: Schema.String,
  year: OptionalNumber,
  movieId: OptionalNumber,
  reason: OptionalString,
})
export type AddCollectionMovieResult = typeof AddCollectionMovieResultSchema.Type

export const AddCollectionResultSchema = Schema.Struct({
  collectionTmdbId: Schema.Number,
  title: Schema.String,
  totalMovies: Schema.Number,
  added: Schema.Number,
  skipped: Schema.Number,
  failed: Schema.Number,
  searchForMovies: Schema.Boolean,
  monitored: Schema.Boolean,
  searchOnAdd: Schema.Boolean,
  records: Schema.Array(AddCollectionMovieResultSchema),
  recordsTruncated: Schema.Boolean,
})
export type AddCollectionResult = typeof AddCollectionResultSchema.Type

export const CollectionInfoResultSchema = Schema.Struct({ collection: CollectionRecordSchema })
export type CollectionInfoResult = typeof CollectionInfoResultSchema.Type

export const RemoveMovieOptionsSchema = Schema.Struct({ deleteFiles: Schema.Boolean })
export type RemoveMovieOptions = typeof RemoveMovieOptionsSchema.Type

export const RemoveMovieResultSchema = Schema.Struct({
  removed: Schema.Boolean,
  tmdbId: Schema.Number,
  deleteFiles: Schema.Boolean,
})
export type RemoveMovieResult = typeof RemoveMovieResultSchema.Type

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
  records: Schema.Array(MovieReleaseRecordSchema),
})
export type CalendarResult = typeof CalendarResultSchema.Type
