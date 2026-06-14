import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  CollectionRecord as DomainCollectionRecord,
  HistoryRecord as DomainHistoryRecord,
  ListResult as DomainListResult,
  MovieLookupResult as DomainMovieLookupResult,
  MovieRecord as DomainMovieRecord,
  MovieReleaseRecord as DomainMovieReleaseRecord,
  QualityProfile as DomainQualityProfile,
  QueueRecord as DomainQueueRecord,
  RootFolder as DomainRootFolder,
  SystemStatus as DomainSystemStatus,
} from './model.js'
import type {
  CollectionRecord,
  HistoryRecord,
  ListResult,
  MovieCollectionSummary,
  MovieLookupResult,
  MovieRecord,
  MovieReleaseRecord,
  QualityProfile,
  QueueRecord,
  RootFolder,
  SystemStatus,
} from './model.js'

const NullableString = Schema.NullOr(Schema.String).pipe(Schema.optional)
const NullableNumber = Schema.NullOr(Schema.Number).pipe(Schema.optional)
const NullableBoolean = Schema.NullOr(Schema.Boolean).pipe(Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObject.Type

const StatusApi = Schema.Struct({
  appName: NullableString,
  version: Schema.String,
  instanceName: NullableString,
  branch: NullableString,
  runtimeVersion: NullableString,
  startupPath: NullableString,
  appData: NullableString,
  osName: NullableString,
  osVersion: NullableString,
  isLinux: NullableBoolean,
  isDocker: NullableBoolean,
})

const RootFolderApi = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: NullableNumber,
  accessible: NullableBoolean,
  unmappedFolders: Schema.Array(Schema.Unknown).pipe(Schema.optional),
})

const QualityProfileApi = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: NullableBoolean,
  cutoff: NullableNumber,
  minFormatScore: NullableNumber,
  cutoffFormatScore: NullableNumber,
})

const CollectionSummary = Schema.Struct({
  tmdbId: Schema.Number,
  title: Schema.String,
})

const MovieLookupApi = Schema.Struct({
  title: Schema.String,
  year: NullableNumber,
  tmdbId: Schema.Number,
  titleSlug: NullableString,
  imdbId: NullableString,
  status: NullableString,
  overview: NullableString,
  runtime: NullableNumber,
  certification: NullableString,
  genres: NullableStringArray,
  studio: NullableString,
  inCinemas: NullableString,
  physicalRelease: NullableString,
  digitalRelease: NullableString,
  remotePoster: NullableString,
  collection: Schema.NullOr(CollectionSummary).pipe(Schema.optional),
})

const MovieRecordApi = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  year: NullableNumber,
  tmdbId: Schema.Number,
  path: NullableString,
  monitored: NullableBoolean,
  status: NullableString,
  hasFile: NullableBoolean,
  qualityProfileId: NullableNumber,
  minimumAvailability: NullableString,
  isAvailable: NullableBoolean,
  sizeOnDisk: NullableNumber,
  inCinemas: NullableString,
  physicalRelease: NullableString,
  digitalRelease: NullableString,
  added: NullableString,
  studio: NullableString,
  runtime: NullableNumber,
  certification: NullableString,
  genres: NullableStringArray,
})

const MovieSummary = Schema.Struct({
  title: NullableString,
  year: NullableNumber,
})

const QualitySummary = Schema.Struct({
  quality: Schema.optional(Schema.Struct({ name: Schema.String })),
})

const QueueStatusMessage = Schema.Struct({
  title: NullableString,
  messages: Schema.Array(Schema.String),
})

const QueueRecordApi = Schema.Struct({
  id: NullableNumber,
  title: Schema.String,
  movie: Schema.NullOr(MovieSummary).pipe(Schema.optional),
  status: Schema.String,
  trackedDownloadStatus: NullableString,
  trackedDownloadState: NullableString,
  statusMessages: Schema.Array(QueueStatusMessage).pipe(Schema.optional),
  errorMessage: NullableString,
  quality: Schema.NullOr(QualitySummary).pipe(Schema.optional),
  size: NullableNumber,
  sizeleft: NullableNumber,
  timeleft: NullableString,
  estimatedCompletionTime: NullableString,
  protocol: NullableString,
  downloadClient: NullableString,
  indexer: NullableString,
  outputPath: NullableString,
})

const MovieReleaseApi = Schema.Struct({
  id: NullableNumber,
  title: Schema.String,
  year: NullableNumber,
  tmdbId: NullableNumber,
  inCinemas: NullableString,
  physicalRelease: NullableString,
  digitalRelease: NullableString,
  hasFile: NullableBoolean,
  monitored: NullableBoolean,
  status: NullableString,
  isAvailable: NullableBoolean,
})

const HistoryRecordApi = Schema.Struct({
  id: NullableNumber,
  date: NullableString,
  eventType: Schema.String,
  sourceTitle: NullableString,
  movie: Schema.NullOr(MovieSummary).pipe(Schema.optional),
  quality: Schema.NullOr(QualitySummary).pipe(Schema.optional),
  downloadId: NullableString,
  data: Schema.NullOr(
    Schema.Struct({
      downloadClient: NullableString,
      downloadClientName: NullableString,
      releaseGroup: NullableString,
      size: NullableString,
    })
  ).pipe(Schema.optional),
})

const CollectionRecordApi = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tmdbId: Schema.Number,
  monitored: NullableBoolean,
  searchOnAdd: NullableBoolean,
})

const tmdbUrl = (tmdbId: number): string => `https://themoviedb.org/movie/${tmdbId}`

// oxlint-disable-next-line effect/prefer-option-over-null -- bridges nullable wire values to the domain's optional-property shape (Schema.optional), not Option
const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

// oxlint-disable-next-line effect/prefer-option-over-null -- parses an optional wire string into the domain's optional-property number shape
const parseOptionalNumber = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const collectionSummaryFromApi = (
  // oxlint-disable-next-line effect/prefer-option-over-null -- wire value is nullable JSON decoded by Schema.NullOr; converts to the domain optional-property shape
  collection: typeof CollectionSummary.Type | null | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- domain summary uses optional-property shape (Schema.optional), not Option
): MovieCollectionSummary | undefined =>
  collection === null || collection === undefined
    ? undefined
    : {
        tmdbId: collection.tmdbId,
        title: collection.title,
      }

const collectionSummaryToApi = (
  // oxlint-disable-next-line effect/prefer-option-over-null -- domain summary uses optional-property shape (Schema.optional), not Option
  collection: MovieCollectionSummary | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- encodes back to the nullable wire shape consumed by Schema.NullOr
): typeof CollectionSummary.Type | undefined =>
  collection === undefined ? undefined : { tmdbId: collection.tmdbId, title: collection.title }

const statusMessages = (
  // oxlint-disable-next-line effect/prefer-option-over-null -- wire array is optional per Schema.optional; flattened into a concrete string array
  messages: ReadonlyArray<typeof QueueStatusMessage.Type> | undefined
): ReadonlyArray<string> => messages?.flatMap((message) => message.messages) ?? []

const systemStatusFromApi = (status: typeof StatusApi.Type): SystemStatus => ({
  appName: fromNullable(status.appName),
  version: status.version,
  instanceName: fromNullable(status.instanceName),
  branch: fromNullable(status.branch),
  runtimeVersion: fromNullable(status.runtimeVersion),
  startupPath: fromNullable(status.startupPath),
  appData: fromNullable(status.appData),
  osName: fromNullable(status.osName),
  osVersion: fromNullable(status.osVersion),
  isLinux: fromNullable(status.isLinux),
  isDocker: fromNullable(status.isDocker),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApi.Type => ({
  appName: status.appName,
  version: status.version,
  instanceName: status.instanceName,
  branch: status.branch,
  runtimeVersion: status.runtimeVersion,
  startupPath: status.startupPath,
  appData: status.appData,
  osName: status.osName,
  osVersion: status.osVersion,
  isLinux: status.isLinux,
  isDocker: status.isDocker,
})

export const StatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const lookupResultFromApi = (movie: typeof MovieLookupApi.Type): MovieLookupResult => ({
  title: movie.title,
  year: fromNullable(movie.year),
  tmdbId: movie.tmdbId,
  tmdbUrl: tmdbUrl(movie.tmdbId),
  titleSlug: fromNullable(movie.titleSlug),
  imdbId: fromNullable(movie.imdbId),
  status: fromNullable(movie.status),
  overview: fromNullable(movie.overview),
  runtime: fromNullable(movie.runtime),
  certification: fromNullable(movie.certification),
  genres: fromNullable(movie.genres),
  studio: fromNullable(movie.studio),
  inCinemas: fromNullable(movie.inCinemas),
  physicalRelease: fromNullable(movie.physicalRelease),
  digitalRelease: fromNullable(movie.digitalRelease),
  remotePoster: fromNullable(movie.remotePoster),
  collection: collectionSummaryFromApi(movie.collection),
})

const lookupResultToApi = (movie: MovieLookupResult): typeof MovieLookupApi.Type => ({
  title: movie.title,
  year: movie.year,
  tmdbId: movie.tmdbId,
  titleSlug: movie.titleSlug,
  imdbId: movie.imdbId,
  status: movie.status,
  overview: movie.overview,
  runtime: movie.runtime,
  certification: movie.certification,
  genres: movie.genres,
  studio: movie.studio,
  inCinemas: movie.inCinemas,
  physicalRelease: movie.physicalRelease,
  digitalRelease: movie.digitalRelease,
  remotePoster: movie.remotePoster,
  collection: collectionSummaryToApi(movie.collection),
})

export const MovieLookupSchema = MovieLookupApi.pipe(
  Schema.decodeTo(DomainMovieLookupResult, {
    decode: SchemaGetter.transform(lookupResultFromApi),
    encode: SchemaGetter.transform(lookupResultToApi),
  })
)

const movieRecordFromApi = (movie: typeof MovieRecordApi.Type): MovieRecord => ({
  id: movie.id,
  title: movie.title,
  year: fromNullable(movie.year),
  tmdbId: movie.tmdbId,
  path: fromNullable(movie.path),
  monitored: fromNullable(movie.monitored),
  status: fromNullable(movie.status),
  hasFile: fromNullable(movie.hasFile),
  qualityProfileId: fromNullable(movie.qualityProfileId),
  minimumAvailability: fromNullable(movie.minimumAvailability),
  isAvailable: fromNullable(movie.isAvailable),
  sizeOnDisk: fromNullable(movie.sizeOnDisk),
  inCinemas: fromNullable(movie.inCinemas),
  physicalRelease: fromNullable(movie.physicalRelease),
  digitalRelease: fromNullable(movie.digitalRelease),
  added: fromNullable(movie.added),
  studio: fromNullable(movie.studio),
  runtime: fromNullable(movie.runtime),
  certification: fromNullable(movie.certification),
  genres: fromNullable(movie.genres),
})

const movieRecordToApi = (movie: MovieRecord): typeof MovieRecordApi.Type => ({
  id: movie.id,
  title: movie.title,
  year: movie.year,
  tmdbId: movie.tmdbId,
  path: movie.path,
  monitored: movie.monitored,
  status: movie.status,
  hasFile: movie.hasFile,
  qualityProfileId: movie.qualityProfileId,
  minimumAvailability: movie.minimumAvailability,
  isAvailable: movie.isAvailable,
  sizeOnDisk: movie.sizeOnDisk,
  inCinemas: movie.inCinemas,
  physicalRelease: movie.physicalRelease,
  digitalRelease: movie.digitalRelease,
  added: movie.added,
  studio: movie.studio,
  runtime: movie.runtime,
  certification: movie.certification,
  genres: movie.genres,
})

export const MovieRecordSchema = MovieRecordApi.pipe(
  Schema.decodeTo(DomainMovieRecord, {
    decode: SchemaGetter.transform(movieRecordFromApi),
    encode: SchemaGetter.transform(movieRecordToApi),
  })
)

const rootFolderFromApi = (folder: typeof RootFolderApi.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: fromNullable(folder.freeSpace),
  accessible: fromNullable(folder.accessible),
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

const qualityProfileFromApi = (profile: typeof QualityProfileApi.Type): QualityProfile => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: fromNullable(profile.upgradeAllowed),
  cutoff: fromNullable(profile.cutoff),
  minFormatScore: fromNullable(profile.minFormatScore),
  cutoffFormatScore: fromNullable(profile.cutoffFormatScore),
})

const qualityProfileToApi = (profile: QualityProfile): typeof QualityProfileApi.Type => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: profile.upgradeAllowed,
  cutoff: profile.cutoff,
  minFormatScore: profile.minFormatScore,
  cutoffFormatScore: profile.cutoffFormatScore,
})

export const QualityProfileSchema = QualityProfileApi.pipe(
  Schema.decodeTo(DomainQualityProfile, {
    decode: SchemaGetter.transform(qualityProfileFromApi),
    encode: SchemaGetter.transform(qualityProfileToApi),
  })
)

const queueIdFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => {
  const id = fromNullable(record.id)
  return id === undefined ? {} : { id }
}

const queueMovieFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => {
  const movieTitle = fromNullable(record.movie?.title)
  const year = fromNullable(record.movie?.year)

  return {
    ...(movieTitle === undefined ? {} : { movieTitle }),
    ...(year === undefined ? {} : { year }),
  }
}

const queueStatusFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => {
  const trackedDownloadStatus = fromNullable(record.trackedDownloadStatus)
  const trackedDownloadState = fromNullable(record.trackedDownloadState)
  const errorMessage = fromNullable(record.errorMessage)

  return {
    ...(trackedDownloadStatus === undefined ? {} : { trackedDownloadStatus }),
    ...(trackedDownloadState === undefined ? {} : { trackedDownloadState }),
    statusMessages: statusMessages(record.statusMessages),
    // oxlint-disable-next-line effect/no-length-comparison -- `errorMessage` is a string; checking for an empty string, not an array
    ...(errorMessage === undefined || errorMessage.length === 0 ? {} : { errorMessage }),
  }
}

const queueTransferFieldsFromApi = (record: typeof QueueRecordApi.Type): Partial<QueueRecord> => {
  const size = fromNullable(record.size)
  const sizeleft = fromNullable(record.sizeleft)
  const timeleft = fromNullable(record.timeleft)
  const estimatedCompletionTime = fromNullable(record.estimatedCompletionTime)
  const protocol = fromNullable(record.protocol)
  const downloadClient = fromNullable(record.downloadClient)
  const indexer = fromNullable(record.indexer)
  const outputPath = fromNullable(record.outputPath)

  return {
    ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
    ...(size === undefined ? {} : { size }),
    ...(sizeleft === undefined ? {} : { sizeleft }),
    ...(timeleft === undefined ? {} : { timeleft }),
    ...(estimatedCompletionTime === undefined ? {} : { estimatedCompletionTime }),
    ...(protocol === undefined ? {} : { protocol }),
    ...(downloadClient === undefined ? {} : { downloadClient }),
    ...(indexer === undefined ? {} : { indexer }),
    ...(outputPath === undefined ? {} : { outputPath }),
  }
}

const queueRecordFromApi = (record: typeof QueueRecordApi.Type): QueueRecord => ({
  ...queueIdFieldsFromApi(record),
  title: record.title,
  ...queueMovieFieldsFromApi(record),
  status: record.status,
  ...queueStatusFieldsFromApi(record),
  ...queueTransferFieldsFromApi(record),
})

const queueRecordToApi = (record: QueueRecord): typeof QueueRecordApi.Type => ({
  id: record.id,
  title: record.title,
  movie:
    record.movieTitle === undefined && record.year === undefined
      ? undefined
      : { title: record.movieTitle, year: record.year },
  status: record.status,
  trackedDownloadStatus: record.trackedDownloadStatus,
  trackedDownloadState: record.trackedDownloadState,
  statusMessages: record.statusMessages?.map((message) => ({ messages: [message] })),
  errorMessage: record.errorMessage,
  quality: record.quality === undefined ? undefined : { quality: { name: record.quality } },
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

const movieReleaseRecordFromApi = (movie: typeof MovieReleaseApi.Type): MovieReleaseRecord => ({
  ...(fromNullable(movie.id) === undefined ? {} : { id: fromNullable(movie.id) }),
  title: movie.title,
  ...(fromNullable(movie.year) === undefined ? {} : { year: fromNullable(movie.year) }),
  ...(fromNullable(movie.tmdbId) === undefined ? {} : { tmdbId: fromNullable(movie.tmdbId) }),
  ...(fromNullable(movie.inCinemas) === undefined ? {} : { inCinemas: fromNullable(movie.inCinemas) }),
  ...(fromNullable(movie.physicalRelease) === undefined
    ? {}
    : { physicalRelease: fromNullable(movie.physicalRelease) }),
  ...(fromNullable(movie.digitalRelease) === undefined ? {} : { digitalRelease: fromNullable(movie.digitalRelease) }),
  ...(fromNullable(movie.hasFile) === undefined ? {} : { hasFile: fromNullable(movie.hasFile) }),
  ...(fromNullable(movie.monitored) === undefined ? {} : { monitored: fromNullable(movie.monitored) }),
  ...(fromNullable(movie.status) === undefined ? {} : { status: fromNullable(movie.status) }),
  ...(fromNullable(movie.isAvailable) === undefined ? {} : { isAvailable: fromNullable(movie.isAvailable) }),
})

const movieReleaseRecordToApi = (movie: MovieReleaseRecord): typeof MovieReleaseApi.Type => ({
  id: movie.id,
  title: movie.title,
  year: movie.year,
  tmdbId: movie.tmdbId,
  inCinemas: movie.inCinemas,
  physicalRelease: movie.physicalRelease,
  digitalRelease: movie.digitalRelease,
  hasFile: movie.hasFile,
  monitored: movie.monitored,
  status: movie.status,
  isAvailable: movie.isAvailable,
})

export const MovieReleaseSchema = MovieReleaseApi.pipe(
  Schema.decodeTo(DomainMovieReleaseRecord, {
    decode: SchemaGetter.transform(movieReleaseRecordFromApi),
    encode: SchemaGetter.transform(movieReleaseRecordToApi),
  })
)

const historyDataFieldsFromApi = (record: typeof HistoryRecordApi.Type): Partial<HistoryRecord> => {
  const size = parseOptionalNumber(record.data?.size)

  return {
    ...(fromNullable(record.data?.downloadClientName) === undefined &&
    fromNullable(record.data?.downloadClient) === undefined
      ? {}
      : { downloadClient: fromNullable(record.data?.downloadClientName) ?? fromNullable(record.data?.downloadClient) }),
    ...(fromNullable(record.data?.releaseGroup) === undefined
      ? {}
      : { releaseGroup: fromNullable(record.data?.releaseGroup) }),
    ...(size === undefined ? {} : { size }),
    ...(fromNullable(record.downloadId) === undefined ? {} : { downloadId: fromNullable(record.downloadId) }),
  }
}

const historyRecordFromApi = (record: typeof HistoryRecordApi.Type): HistoryRecord => ({
  ...(fromNullable(record.id) === undefined ? {} : { id: fromNullable(record.id) }),
  ...(fromNullable(record.date) === undefined ? {} : { date: fromNullable(record.date) }),
  eventType: record.eventType,
  ...(fromNullable(record.sourceTitle) === undefined ? {} : { sourceTitle: fromNullable(record.sourceTitle) }),
  ...(fromNullable(record.movie?.title) === undefined ? {} : { movieTitle: fromNullable(record.movie?.title) }),
  ...(fromNullable(record.movie?.year) === undefined ? {} : { year: fromNullable(record.movie?.year) }),
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  ...historyDataFieldsFromApi(record),
})

const historyRecordToApi = (record: HistoryRecord): typeof HistoryRecordApi.Type => ({
  id: record.id,
  date: record.date,
  eventType: record.eventType,
  sourceTitle: record.sourceTitle,
  movie:
    record.movieTitle === undefined && record.year === undefined
      ? undefined
      : { title: record.movieTitle, year: record.year },
  quality: record.quality === undefined ? undefined : { quality: { name: record.quality } },
  downloadId: record.downloadId,
  data: { downloadClient: record.downloadClient, releaseGroup: record.releaseGroup, size: record.size?.toString() },
})

const HistoryRecordSchema = HistoryRecordApi.pipe(
  Schema.decodeTo(DomainHistoryRecord, {
    decode: SchemaGetter.transform(historyRecordFromApi),
    encode: SchemaGetter.transform(historyRecordToApi),
  })
)

const collectionRecordFromApi = (collection: typeof CollectionRecordApi.Type): CollectionRecord => ({
  id: collection.id,
  title: collection.title,
  tmdbId: collection.tmdbId,
  monitored: fromNullable(collection.monitored),
  searchOnAdd: fromNullable(collection.searchOnAdd),
})

const collectionRecordToApi = (collection: CollectionRecord): typeof CollectionRecordApi.Type => ({
  id: collection.id,
  title: collection.title,
  tmdbId: collection.tmdbId,
  monitored: collection.monitored,
  searchOnAdd: collection.searchOnAdd,
})

export const CollectionRecordSchema = CollectionRecordApi.pipe(
  Schema.decodeTo(DomainCollectionRecord, {
    decode: SchemaGetter.transform(collectionRecordFromApi),
    encode: SchemaGetter.transform(collectionRecordToApi),
  })
)

const QueueResponseApi = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(QueueRecordSchema),
})

const MissingResponseApi = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(MovieReleaseSchema),
})

const HistoryResponseApi = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

const queueResponseFromApi = (response: typeof QueueResponseApi.Type): ListResult<QueueRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const queueResponseToApi = (result: ListResult<QueueRecord>): typeof QueueResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const QueueResponseSchema = QueueResponseApi.pipe(
  Schema.decodeTo(DomainListResult(DomainQueueRecord), {
    decode: SchemaGetter.transform(queueResponseFromApi),
    encode: SchemaGetter.transform(queueResponseToApi),
  })
)

const missingResponseFromApi = (response: typeof MissingResponseApi.Type): ListResult<MovieReleaseRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const missingResponseToApi = (result: ListResult<MovieReleaseRecord>): typeof MissingResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const MissingResponseSchema = MissingResponseApi.pipe(
  Schema.decodeTo(DomainListResult(DomainMovieReleaseRecord), {
    decode: SchemaGetter.transform(missingResponseFromApi),
    encode: SchemaGetter.transform(missingResponseToApi),
  })
)

const historyResponseFromApi = (response: typeof HistoryResponseApi.Type): ListResult<HistoryRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const historyResponseToApi = (result: ListResult<HistoryRecord>): typeof HistoryResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const HistoryResponseSchema = HistoryResponseApi.pipe(
  Schema.decodeTo(DomainListResult(DomainHistoryRecord), {
    decode: SchemaGetter.transform(historyResponseFromApi),
    encode: SchemaGetter.transform(historyResponseToApi),
  })
)
