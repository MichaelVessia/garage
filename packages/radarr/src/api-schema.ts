import { Schema } from 'effect'

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

export const StatusSchema = Schema.Struct({
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

export const RootFolderSchema = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
  freeSpace: NullableNumber,
  accessible: NullableBoolean,
  unmappedFolders: Schema.optional(Schema.Array(Schema.Unknown)),
})

export const QualityProfileSchema = Schema.Struct({
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

export const MovieLookupSchema = Schema.Struct({
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

export const MovieRecordSchema = Schema.Struct({
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

const QueueRecordSchema = Schema.Struct({
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

export const QueueResponseSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(QueueRecordSchema),
})

export const MovieReleaseSchema = Schema.Struct({
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

export const MissingResponseSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(MovieReleaseSchema),
})

export const HistoryRecordSchema = Schema.Struct({
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

export const HistoryResponseSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

export const CollectionRecordSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  tmdbId: Schema.Number,
  monitored: NullableBoolean,
  searchOnAdd: NullableBoolean,
})

const toTmdbUrl = (tmdbId: number): string => `https://themoviedb.org/movie/${tmdbId}`

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const parseOptionalNumber = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toCollectionSummary = (
  collection: typeof CollectionSummarySchema.Type | null | undefined
): MovieCollectionSummary | undefined =>
  collection === null || collection === undefined
    ? undefined
    : {
        tmdbId: collection.tmdbId,
        title: collection.title,
      }

const statusMessages = (
  messages: ReadonlyArray<typeof QueueStatusMessageSchema.Type> | undefined
): ReadonlyArray<string> => messages?.flatMap((message) => message.messages) ?? []

export const toSystemStatus = (status: typeof StatusSchema.Type): SystemStatus => ({
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

export const toLookupResult = (movie: typeof MovieLookupSchema.Type): MovieLookupResult => ({
  title: movie.title,
  year: fromNullable(movie.year),
  tmdbId: movie.tmdbId,
  tmdbUrl: toTmdbUrl(movie.tmdbId),
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
  collection: toCollectionSummary(movie.collection),
})

export const toMovieRecord = (movie: typeof MovieRecordSchema.Type): MovieRecord => ({
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

export const toRootFolder = (folder: typeof RootFolderSchema.Type): RootFolder => ({
  id: folder.id,
  path: folder.path,
  freeSpace: fromNullable(folder.freeSpace),
  accessible: fromNullable(folder.accessible),
  unmappedFolderCount: folder.unmappedFolders?.length ?? 0,
})

export const toQualityProfile = (profile: typeof QualityProfileSchema.Type): QualityProfile => ({
  id: profile.id,
  name: profile.name,
  upgradeAllowed: fromNullable(profile.upgradeAllowed),
  cutoff: fromNullable(profile.cutoff),
  minFormatScore: fromNullable(profile.minFormatScore),
  cutoffFormatScore: fromNullable(profile.cutoffFormatScore),
})

const toQueueIdFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => {
  const id = fromNullable(record.id)
  return id === undefined ? {} : { id }
}

const toQueueMovieFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => {
  const movieTitle = fromNullable(record.movie?.title)
  const year = fromNullable(record.movie?.year)

  return {
    ...(movieTitle === undefined ? {} : { movieTitle }),
    ...(year === undefined ? {} : { year }),
  }
}

const toQueueStatusFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => {
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

const toQueueTransferFields = (record: typeof QueueRecordSchema.Type): Partial<QueueRecord> => {
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

export const toQueueRecord = (record: typeof QueueRecordSchema.Type): QueueRecord => ({
  ...toQueueIdFields(record),
  title: record.title,
  ...toQueueMovieFields(record),
  status: record.status,
  ...toQueueStatusFields(record),
  ...toQueueTransferFields(record),
})

export const toMovieReleaseRecord = (movie: typeof MovieReleaseSchema.Type): MovieReleaseRecord => ({
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

const toHistoryDataFields = (record: typeof HistoryRecordSchema.Type): Partial<HistoryRecord> => {
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

export const toHistoryRecord = (record: typeof HistoryRecordSchema.Type): HistoryRecord => ({
  ...(fromNullable(record.id) === undefined ? {} : { id: fromNullable(record.id) }),
  ...(fromNullable(record.date) === undefined ? {} : { date: fromNullable(record.date) }),
  eventType: record.eventType,
  ...(fromNullable(record.sourceTitle) === undefined ? {} : { sourceTitle: fromNullable(record.sourceTitle) }),
  ...(fromNullable(record.movie?.title) === undefined ? {} : { movieTitle: fromNullable(record.movie?.title) }),
  ...(fromNullable(record.movie?.year) === undefined ? {} : { year: fromNullable(record.movie?.year) }),
  ...(record.quality?.quality?.name === undefined ? {} : { quality: record.quality.quality.name }),
  ...toHistoryDataFields(record),
})

export const toCollectionRecord = (collection: typeof CollectionRecordSchema.Type): CollectionRecord => ({
  id: collection.id,
  title: collection.title,
  tmdbId: collection.tmdbId,
  monitored: fromNullable(collection.monitored),
  searchOnAdd: fromNullable(collection.searchOnAdd),
})

export const toListResult = <Record>(
  response: { readonly totalRecords?: number | null | undefined; readonly records: ReadonlyArray<unknown> },
  records: ReadonlyArray<Record>
): ListResult<Record> => ({
  count: records.length,
  totalRecords: fromNullable(response.totalRecords) ?? records.length,
  records,
})
