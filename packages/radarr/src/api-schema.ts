import { Schema, SchemaGetter } from 'effect'

import {
  CollectionRecordSchema as DomainCollectionRecordSchema,
  HistoryRecordSchema as DomainHistoryRecordSchema,
  ListResultSchema as DomainListResultSchema,
  MovieLookupResultSchema as DomainMovieLookupResultSchema,
  MovieRecordSchema as DomainMovieRecordSchema,
  MovieReleaseRecordSchema as DomainMovieReleaseRecordSchema,
  QualityProfileSchema as DomainQualityProfileSchema,
  QueueRecordSchema as DomainQueueRecordSchema,
  RootFolderSchema as DomainRootFolderSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
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

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

const StatusApiSchema = Schema.Struct({
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

const RootFolderApiSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: NullableNumber,
  accessible: NullableBoolean,
  unmappedFolders: Schema.optional(Schema.Array(Schema.Unknown)),
})

const QualityProfileApiSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  upgradeAllowed: NullableBoolean,
  cutoff: NullableNumber,
  minFormatScore: NullableNumber,
  cutoffFormatScore: NullableNumber,
})

const CollectionSummarySchema = Schema.Struct({
  tmdbId: Schema.Number,
  title: Schema.String,
})

const MovieLookupApiSchema = Schema.Struct({
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
  collection: Schema.optional(Schema.NullOr(CollectionSummarySchema)),
})

const MovieRecordApiSchema = Schema.Struct({
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

const MovieSummarySchema = Schema.Struct({
  title: NullableString,
  year: NullableNumber,
})

const QualitySummarySchema = Schema.Struct({
  quality: Schema.optional(Schema.Struct({ name: Schema.String })),
})

const QueueStatusMessageSchema = Schema.Struct({
  title: NullableString,
  messages: Schema.Array(Schema.String),
})

const QueueRecordApiSchema = Schema.Struct({
  id: NullableNumber,
  title: Schema.String,
  movie: Schema.optional(Schema.NullOr(MovieSummarySchema)),
  status: Schema.String,
  trackedDownloadStatus: NullableString,
  trackedDownloadState: NullableString,
  statusMessages: Schema.optional(Schema.Array(QueueStatusMessageSchema)),
  errorMessage: NullableString,
  quality: Schema.optional(Schema.NullOr(QualitySummarySchema)),
  size: NullableNumber,
  sizeleft: NullableNumber,
  timeleft: NullableString,
  estimatedCompletionTime: NullableString,
  protocol: NullableString,
  downloadClient: NullableString,
  indexer: NullableString,
  outputPath: NullableString,
})

const MovieReleaseApiSchema = Schema.Struct({
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

const HistoryRecordApiSchema = Schema.Struct({
  id: NullableNumber,
  date: NullableString,
  eventType: Schema.String,
  sourceTitle: NullableString,
  movie: Schema.optional(Schema.NullOr(MovieSummarySchema)),
  quality: Schema.optional(Schema.NullOr(QualitySummarySchema)),
  downloadId: NullableString,
  data: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        downloadClient: NullableString,
        downloadClientName: NullableString,
        releaseGroup: NullableString,
        size: NullableString,
      })
    )
  ),
})

const CollectionRecordApiSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tmdbId: Schema.Number,
  monitored: NullableBoolean,
  searchOnAdd: NullableBoolean,
})

const tmdbUrl = (tmdbId: number): string => `https://themoviedb.org/movie/${tmdbId}`

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const parseOptionalNumber = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const collectionSummaryFromApi = (
  collection: typeof CollectionSummarySchema.Type | null | undefined
): MovieCollectionSummary | undefined =>
  collection === null || collection === undefined
    ? undefined
    : {
        tmdbId: collection.tmdbId,
        title: collection.title,
      }

const collectionSummaryToApi = (
  collection: MovieCollectionSummary | undefined
): typeof CollectionSummarySchema.Type | undefined =>
  collection === undefined ? undefined : { tmdbId: collection.tmdbId, title: collection.title }

const statusMessages = (
  messages: ReadonlyArray<typeof QueueStatusMessageSchema.Type> | undefined
): ReadonlyArray<string> => messages?.flatMap((message) => message.messages) ?? []

const systemStatusFromApi = (status: typeof StatusApiSchema.Type): SystemStatus => ({
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

const systemStatusToApi = (status: SystemStatus): typeof StatusApiSchema.Type => ({
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

export const StatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const lookupResultFromApi = (movie: typeof MovieLookupApiSchema.Type): MovieLookupResult => ({
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

const lookupResultToApi = (movie: MovieLookupResult): typeof MovieLookupApiSchema.Type => ({
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

export const MovieLookupSchema = MovieLookupApiSchema.pipe(
  Schema.decodeTo(DomainMovieLookupResultSchema, {
    decode: SchemaGetter.transform(lookupResultFromApi),
    encode: SchemaGetter.transform(lookupResultToApi),
  })
)

const movieRecordFromApi = (movie: typeof MovieRecordApiSchema.Type): MovieRecord => ({
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

const movieRecordToApi = (movie: MovieRecord): typeof MovieRecordApiSchema.Type => ({
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

export const MovieRecordSchema = MovieRecordApiSchema.pipe(
  Schema.decodeTo(DomainMovieRecordSchema, {
    decode: SchemaGetter.transform(movieRecordFromApi),
    encode: SchemaGetter.transform(movieRecordToApi),
  })
)

const rootFolderFromApi = (folder: typeof RootFolderApiSchema.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: fromNullable(folder.freeSpace),
  accessible: fromNullable(folder.accessible),
  unmappedFolderCount: folder.unmappedFolders?.length ?? 0,
})

const rootFolderToApi = (folder: RootFolder): typeof RootFolderApiSchema.Type => ({
  id: folder.id,
  path: folder.path,
  freeSpace: folder.freeSpace,
  accessible: folder.accessible,
})

export const RootFolderSchema = RootFolderApiSchema.pipe(
  Schema.decodeTo(DomainRootFolderSchema, {
    decode: SchemaGetter.transform(rootFolderFromApi),
    encode: SchemaGetter.transform(rootFolderToApi),
  })
)

const qualityProfileFromApi = (profile: typeof QualityProfileApiSchema.Type): QualityProfile => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: fromNullable(profile.upgradeAllowed),
  cutoff: fromNullable(profile.cutoff),
  minFormatScore: fromNullable(profile.minFormatScore),
  cutoffFormatScore: fromNullable(profile.cutoffFormatScore),
})

const qualityProfileToApi = (profile: QualityProfile): typeof QualityProfileApiSchema.Type => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: profile.upgradeAllowed,
  cutoff: profile.cutoff,
  minFormatScore: profile.minFormatScore,
  cutoffFormatScore: profile.cutoffFormatScore,
})

export const QualityProfileSchema = QualityProfileApiSchema.pipe(
  Schema.decodeTo(DomainQualityProfileSchema, {
    decode: SchemaGetter.transform(qualityProfileFromApi),
    encode: SchemaGetter.transform(qualityProfileToApi),
  })
)

const queueIdFieldsFromApi = (record: typeof QueueRecordApiSchema.Type): Partial<QueueRecord> => {
  const id = fromNullable(record.id)
  return id === undefined ? {} : { id }
}

const queueMovieFieldsFromApi = (record: typeof QueueRecordApiSchema.Type): Partial<QueueRecord> => {
  const movieTitle = fromNullable(record.movie?.title)
  const year = fromNullable(record.movie?.year)

  return {
    ...(movieTitle === undefined ? {} : { movieTitle }),
    ...(year === undefined ? {} : { year }),
  }
}

const queueStatusFieldsFromApi = (record: typeof QueueRecordApiSchema.Type): Partial<QueueRecord> => {
  const trackedDownloadStatus = fromNullable(record.trackedDownloadStatus)
  const trackedDownloadState = fromNullable(record.trackedDownloadState)
  const errorMessage = fromNullable(record.errorMessage)

  return {
    ...(trackedDownloadStatus === undefined ? {} : { trackedDownloadStatus }),
    ...(trackedDownloadState === undefined ? {} : { trackedDownloadState }),
    statusMessages: statusMessages(record.statusMessages),
    ...(errorMessage === undefined || errorMessage.length === 0 ? {} : { errorMessage }),
  }
}

const queueTransferFieldsFromApi = (record: typeof QueueRecordApiSchema.Type): Partial<QueueRecord> => {
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

const queueRecordFromApi = (record: typeof QueueRecordApiSchema.Type): QueueRecord => ({
  ...queueIdFieldsFromApi(record),
  title: record.title,
  ...queueMovieFieldsFromApi(record),
  status: record.status,
  ...queueStatusFieldsFromApi(record),
  ...queueTransferFieldsFromApi(record),
})

const queueRecordToApi = (record: QueueRecord): typeof QueueRecordApiSchema.Type => ({
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

const QueueRecordSchema = QueueRecordApiSchema.pipe(
  Schema.decodeTo(DomainQueueRecordSchema, {
    decode: SchemaGetter.transform(queueRecordFromApi),
    encode: SchemaGetter.transform(queueRecordToApi),
  })
)

const movieReleaseRecordFromApi = (movie: typeof MovieReleaseApiSchema.Type): MovieReleaseRecord => ({
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

const movieReleaseRecordToApi = (movie: MovieReleaseRecord): typeof MovieReleaseApiSchema.Type => ({
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

export const MovieReleaseSchema = MovieReleaseApiSchema.pipe(
  Schema.decodeTo(DomainMovieReleaseRecordSchema, {
    decode: SchemaGetter.transform(movieReleaseRecordFromApi),
    encode: SchemaGetter.transform(movieReleaseRecordToApi),
  })
)

const historyDataFieldsFromApi = (record: typeof HistoryRecordApiSchema.Type): Partial<HistoryRecord> => {
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

const historyRecordFromApi = (record: typeof HistoryRecordApiSchema.Type): HistoryRecord => ({
  ...(fromNullable(record.id) === undefined ? {} : { id: fromNullable(record.id) }),
  ...(fromNullable(record.date) === undefined ? {} : { date: fromNullable(record.date) }),
  eventType: record.eventType,
  ...(fromNullable(record.sourceTitle) === undefined ? {} : { sourceTitle: fromNullable(record.sourceTitle) }),
  ...(fromNullable(record.movie?.title) === undefined ? {} : { movieTitle: fromNullable(record.movie?.title) }),
  ...(fromNullable(record.movie?.year) === undefined ? {} : { year: fromNullable(record.movie?.year) }),
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  ...historyDataFieldsFromApi(record),
})

const historyRecordToApi = (record: HistoryRecord): typeof HistoryRecordApiSchema.Type => ({
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

const HistoryRecordSchema = HistoryRecordApiSchema.pipe(
  Schema.decodeTo(DomainHistoryRecordSchema, {
    decode: SchemaGetter.transform(historyRecordFromApi),
    encode: SchemaGetter.transform(historyRecordToApi),
  })
)

const collectionRecordFromApi = (collection: typeof CollectionRecordApiSchema.Type): CollectionRecord => ({
  id: collection.id,
  title: collection.title,
  tmdbId: collection.tmdbId,
  monitored: fromNullable(collection.monitored),
  searchOnAdd: fromNullable(collection.searchOnAdd),
})

const collectionRecordToApi = (collection: CollectionRecord): typeof CollectionRecordApiSchema.Type => ({
  id: collection.id,
  title: collection.title,
  tmdbId: collection.tmdbId,
  monitored: collection.monitored,
  searchOnAdd: collection.searchOnAdd,
})

export const CollectionRecordSchema = CollectionRecordApiSchema.pipe(
  Schema.decodeTo(DomainCollectionRecordSchema, {
    decode: SchemaGetter.transform(collectionRecordFromApi),
    encode: SchemaGetter.transform(collectionRecordToApi),
  })
)

const QueueResponseApiSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(QueueRecordSchema),
})

const MissingResponseApiSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(MovieReleaseSchema),
})

const HistoryResponseApiSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

const queueResponseFromApi = (response: typeof QueueResponseApiSchema.Type): ListResult<QueueRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const queueResponseToApi = (result: ListResult<QueueRecord>): typeof QueueResponseApiSchema.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const QueueResponseSchema = QueueResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainQueueRecordSchema), {
    decode: SchemaGetter.transform(queueResponseFromApi),
    encode: SchemaGetter.transform(queueResponseToApi),
  })
)

const missingResponseFromApi = (response: typeof MissingResponseApiSchema.Type): ListResult<MovieReleaseRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const missingResponseToApi = (result: ListResult<MovieReleaseRecord>): typeof MissingResponseApiSchema.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const MissingResponseSchema = MissingResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainMovieReleaseRecordSchema), {
    decode: SchemaGetter.transform(missingResponseFromApi),
    encode: SchemaGetter.transform(missingResponseToApi),
  })
)

const historyResponseFromApi = (response: typeof HistoryResponseApiSchema.Type): ListResult<HistoryRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const historyResponseToApi = (result: ListResult<HistoryRecord>): typeof HistoryResponseApiSchema.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const HistoryResponseSchema = HistoryResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainHistoryRecordSchema), {
    decode: SchemaGetter.transform(historyResponseFromApi),
    encode: SchemaGetter.transform(historyResponseToApi),
  })
)
