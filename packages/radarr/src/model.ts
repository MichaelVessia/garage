import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const RadarrConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
  defaultQualityProfileId: Schema.Number,
})
export type RadarrConfigValue = typeof RadarrConfigValue.Type

export const SystemStatus = Schema.Struct({
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

export const MovieCollectionSummary = Schema.Struct({
  tmdbId: Schema.Number,
  title: Schema.String,
})
export type MovieCollectionSummary = typeof MovieCollectionSummary.Type

export const MovieLookupResult = Schema.Struct({
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
  collection: Schema.optional(MovieCollectionSummary),
})
export type MovieLookupResult = typeof MovieLookupResult.Type

export const MovieRecord = Schema.Struct({
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
export type MovieRecord = typeof MovieRecord.Type

export const MovieReleaseRecord = Schema.Struct({
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
export type MovieReleaseRecord = typeof MovieReleaseRecord.Type

export const QueueRecord = Schema.Struct({
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
export type QueueRecord = typeof QueueRecord.Type

export const HistoryRecord = Schema.Struct({
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
export type HistoryRecord = typeof HistoryRecord.Type

export const CollectionRecord = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tmdbId: Schema.Number,
  monitored: OptionalBoolean,
  searchOnAdd: OptionalBoolean,
})
export type CollectionRecord = typeof CollectionRecord.Type

export const ConfigSummary = Schema.Struct({
  rootFolders: Schema.Array(RootFolder),
  qualityProfiles: Schema.Array(QualityProfile),
})
export type ConfigSummary = typeof ConfigSummary.Type

export const SearchResult = Schema.Struct({
  query: Schema.String,
  count: Schema.Number,
  results: Schema.Array(MovieLookupResult),
})
export type SearchResult = typeof SearchResult.Type

export const ExistsResult = Schema.Struct({
  tmdbId: Schema.Number,
  exists: Schema.Boolean,
  movie: Schema.optional(MovieRecord),
})
export type ExistsResult = typeof ExistsResult.Type

export const AddMovieOptions = Schema.Struct({
  qualityProfileId: OptionalNumber,
  searchForMovie: Schema.Boolean,
})
export type AddMovieOptions = typeof AddMovieOptions.Type

export const AddMovieApiOptions = Schema.Struct({
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMovie: Schema.Boolean,
})
export type AddMovieApiOptions = typeof AddMovieApiOptions.Type

export const AddMovieResult = Schema.Struct({
  added: Schema.Boolean,
  movie: MovieRecord,
  qualityProfileId: Schema.Number,
  rootFolderPath: Schema.String,
  searchForMovie: Schema.Boolean,
})
export type AddMovieResult = typeof AddMovieResult.Type

export const AddCollectionOptions = Schema.Struct({
  searchForMovies: Schema.Boolean,
  resultLimit: Schema.Number,
})
export type AddCollectionOptions = typeof AddCollectionOptions.Type

export const AddCollectionMovieAction = Schema.Literals(['added', 'skipped', 'failed'])
export type AddCollectionMovieAction = typeof AddCollectionMovieAction.Type

export const AddCollectionMovieResult = Schema.Struct({
  action: AddCollectionMovieAction,
  tmdbId: Schema.Number,
  title: Schema.String,
  year: OptionalNumber,
  movieId: OptionalNumber,
  reason: OptionalString,
})
export type AddCollectionMovieResult = typeof AddCollectionMovieResult.Type

export const AddCollectionResult = Schema.Struct({
  collectionTmdbId: Schema.Number,
  title: Schema.String,
  totalMovies: Schema.Number,
  added: Schema.Number,
  skipped: Schema.Number,
  failed: Schema.Number,
  searchForMovies: Schema.Boolean,
  monitored: Schema.Boolean,
  searchOnAdd: Schema.Boolean,
  records: Schema.Array(AddCollectionMovieResult),
  recordsTruncated: Schema.Boolean,
})
export type AddCollectionResult = typeof AddCollectionResult.Type

export const CollectionInfoResult = Schema.Struct({ collection: CollectionRecord })
export type CollectionInfoResult = typeof CollectionInfoResult.Type

export const RemoveMovieOptions = Schema.Struct({ deleteFiles: Schema.Boolean })
export type RemoveMovieOptions = typeof RemoveMovieOptions.Type

export const RemoveMovieResult = Schema.Struct({
  removed: Schema.Boolean,
  tmdbId: Schema.Number,
  deleteFiles: Schema.Boolean,
})
export type RemoveMovieResult = typeof RemoveMovieResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const CalendarOptions = Schema.Struct({ days: Schema.Number })
export type CalendarOptions = typeof CalendarOptions.Type

export const ListResult = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>

export const CalendarResult = Schema.Struct({
  days: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(MovieReleaseRecord),
})
export type CalendarResult = typeof CalendarResult.Type
