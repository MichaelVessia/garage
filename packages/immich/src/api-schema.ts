import { listResult } from '@garage/cli-protocol'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  AlbumInfo as DomainAlbumInfo,
  AlbumSummary as DomainAlbumSummary,
  CurrentUser as DomainCurrentUser,
  JobRecord as DomainJobRecord,
  ListResult as DomainListResult,
  PeopleResult as DomainPeopleResult,
  PersonRecord as DomainPersonRecord,
  SearchResult as DomainSearchResult,
  Statistics as DomainStatistics,
  StorageStatus as DomainStorageStatus,
  TagRecord as DomainTagRecord,
  UserRecord as DomainUserRecord,
  VersionParts as DomainVersionParts,
} from './model.js'
import type {
  AlbumInfo,
  AlbumSummary,
  AssetExif,
  AssetRecord,
  CurrentUser,
  JobCounts,
  JobRecord,
  ListResult,
  PeopleResult,
  PersonRecord,
  SearchResult,
  Statistics,
  StorageStatus,
  TagRecord,
  UserRecord,
  UsersResult,
} from './model.js'

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const NullableNumber = Schema.Number.pipe(Schema.NullOr, Schema.optional)
const NullableBoolean = Schema.Boolean.pipe(Schema.NullOr, Schema.optional)

const VersionApi = Schema.Struct({ major: Schema.Number, minor: Schema.Number, patch: Schema.Number })
export const VersionSchema = VersionApi.pipe(Schema.decodeTo(DomainVersionParts))

export const Ping = Schema.Struct({ res: NullableString })
export type Ping = typeof Ping.Type

const StatisticsUser = Schema.Struct({
  userId: Schema.String,
  userName: NullableString,
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  quotaSizeInBytes: NullableNumber,
})

const StatisticsApi = Schema.Struct({
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  usagePhotos: Schema.Number,
  usageVideos: Schema.Number,
  usageByUser: Schema.Array(StatisticsUser),
})

const StorageApi = Schema.Struct({
  diskSize: NullableString,
  diskUse: NullableString,
  diskAvailable: NullableString,
  diskSizeRaw: NullableNumber,
  diskUseRaw: NullableNumber,
  diskAvailableRaw: NullableNumber,
  diskUsagePercentage: NullableNumber,
})

const UserApi = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  email: NullableString,
  isAdmin: NullableBoolean,
  quotaSizeInBytes: NullableNumber,
  quotaUsageInBytes: NullableNumber,
  status: NullableString,
  storageLabel: NullableString,
})

const AlbumApi = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
})

const Exif = Schema.Struct({ make: NullableString, model: NullableString })

const AssetApi = Schema.Struct({
  id: Schema.String,
  type: NullableString,
  originalFileName: NullableString,
  fileCreatedAt: NullableString,
  exifInfo: Exif.pipe(Schema.NullOr, Schema.optional),
})

const AlbumInfoApi = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
  assets: Schema.Array(AssetApi).pipe(Schema.NullOr, Schema.optional),
})

const SearchAssets = Schema.Struct({
  total: Schema.Number,
  count: Schema.Number,
  items: Schema.Array(AssetApi),
})
const SearchResponseApi = Schema.Struct({ assets: SearchAssets })

const PersonApi = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  birthDate: NullableString,
  isFavorite: NullableBoolean,
  isHidden: NullableBoolean,
  updatedAt: NullableString,
})

const PeopleResponseApi = Schema.Struct({
  total: NullableNumber,
  hidden: NullableNumber,
  hasNextPage: NullableBoolean,
  people: Schema.Array(PersonApi),
})

const JobCountsApi = Schema.Struct({
  active: NullableNumber,
  completed: NullableNumber,
  failed: NullableNumber,
  delayed: NullableNumber,
  waiting: NullableNumber,
  paused: NullableNumber,
})

const QueueStatus = Schema.Struct({ isPaused: NullableBoolean, isActive: NullableBoolean })

const JobStatus = Schema.Struct({
  queueStatus: QueueStatus.pipe(Schema.NullOr, Schema.optional),
  jobCounts: JobCountsApi.pipe(Schema.NullOr, Schema.optional),
})

const JobsApi = Schema.Record(Schema.String, JobStatus)

const TagApi = Schema.Struct({ id: Schema.String, name: NullableString, value: NullableString })

// oxlint-disable-next-line effect/prefer-option-over-null -- bridges nullable wire values to the package's `T | undefined` domain model (built on Schema.optional); Option would require rewriting every model field and the JSON envelope contract.
const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const statisticsFromApi = (stats: typeof StatisticsApi.Type): Statistics => ({
  photos: stats.photos,
  videos: stats.videos,
  usageBytes: stats.usage,
  usagePhotosBytes: stats.usagePhotos,
  usageVideosBytes: stats.usageVideos,
  perUser: stats.usageByUser.map((user) => ({
    userId: user.userId,
    userName: fromNullable(user.userName),
    photos: user.photos,
    videos: user.videos,
    usageBytes: user.usage,
    quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  })),
})

const statisticsToApi = (stats: Statistics): typeof StatisticsApi.Type => ({
  photos: stats.photos,
  videos: stats.videos,
  usage: stats.usageBytes,
  usagePhotos: stats.usagePhotosBytes,
  usageVideos: stats.usageVideosBytes,
  usageByUser: stats.perUser.map((user) => ({
    userId: user.userId,
    userName: user.userName,
    photos: user.photos,
    videos: user.videos,
    usage: user.usageBytes,
    quotaSizeInBytes: user.quotaSizeInBytes,
  })),
})

export const StatisticsSchema = StatisticsApi.pipe(
  Schema.decodeTo(DomainStatistics, {
    decode: SchemaGetter.transform(statisticsFromApi),
    encode: SchemaGetter.transform(statisticsToApi),
  })
)

const storageFromApi = (storage: typeof StorageApi.Type): StorageStatus => ({
  diskSize: fromNullable(storage.diskSize),
  diskUse: fromNullable(storage.diskUse),
  diskAvailable: fromNullable(storage.diskAvailable),
  diskSizeRaw: fromNullable(storage.diskSizeRaw),
  diskUseRaw: fromNullable(storage.diskUseRaw),
  diskAvailableRaw: fromNullable(storage.diskAvailableRaw),
  diskUsagePercentage: fromNullable(storage.diskUsagePercentage),
})

const storageToApi = (storage: StorageStatus): typeof StorageApi.Type => ({
  diskSize: storage.diskSize,
  diskUse: storage.diskUse,
  diskAvailable: storage.diskAvailable,
  diskSizeRaw: storage.diskSizeRaw,
  diskUseRaw: storage.diskUseRaw,
  diskAvailableRaw: storage.diskAvailableRaw,
  diskUsagePercentage: storage.diskUsagePercentage,
})

export const StorageSchema = StorageApi.pipe(
  Schema.decodeTo(DomainStorageStatus, {
    decode: SchemaGetter.transform(storageFromApi),
    encode: SchemaGetter.transform(storageToApi),
  })
)

const userRecordFromApi = (user: typeof UserApi.Type): UserRecord => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
  status: fromNullable(user.status),
})

const userRecordToApi = (user: UserRecord): typeof UserApi.Type => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  quotaSizeInBytes: user.quotaSizeInBytes,
  quotaUsageInBytes: user.quotaUsageInBytes,
  status: user.status,
})

export const UserSchema = UserApi.pipe(
  Schema.decodeTo(DomainUserRecord, {
    decode: SchemaGetter.transform(userRecordFromApi),
    encode: SchemaGetter.transform(userRecordToApi),
  })
)

const currentUserFromApi = (user: typeof UserApi.Type): CurrentUser => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  storageLabel: fromNullable(user.storageLabel),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
})

const currentUserToApi = (user: CurrentUser): typeof UserApi.Type => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  storageLabel: user.storageLabel,
  quotaSizeInBytes: user.quotaSizeInBytes,
  quotaUsageInBytes: user.quotaUsageInBytes,
})

export const CurrentUserSchema = UserApi.pipe(
  Schema.decodeTo(DomainCurrentUser, {
    decode: SchemaGetter.transform(currentUserFromApi),
    encode: SchemaGetter.transform(currentUserToApi),
  })
)

const albumSummaryFromApi = (album: typeof AlbumApi.Type): AlbumSummary => ({
  id: album.id,
  albumName: fromNullable(album.albumName),
  assetCount: fromNullable(album.assetCount),
  createdAt: fromNullable(album.createdAt),
  ownerId: fromNullable(album.ownerId),
})

const albumSummaryToApi = (album: AlbumSummary): typeof AlbumApi.Type => ({
  id: album.id,
  albumName: album.albumName,
  assetCount: album.assetCount,
  createdAt: album.createdAt,
  ownerId: album.ownerId,
})

export const AlbumSchema = AlbumApi.pipe(
  Schema.decodeTo(DomainAlbumSummary, {
    decode: SchemaGetter.transform(albumSummaryFromApi),
    encode: SchemaGetter.transform(albumSummaryToApi),
  })
)

// oxlint-disable-next-line effect/prefer-option-over-null -- bridges the nullable wire exif value to the package's `T | undefined` domain model; Option would require rewriting AssetRecord and the JSON envelope contract.
const assetExifFromApi = (exif: typeof Exif.Type | null | undefined): AssetExif | undefined =>
  exif === null || exif === undefined ? undefined : { make: fromNullable(exif.make), model: fromNullable(exif.model) }

const assetRecordFromApi = (asset: typeof AssetApi.Type): AssetRecord => ({
  id: asset.id,
  type: fromNullable(asset.type),
  originalFileName: fromNullable(asset.originalFileName),
  fileCreatedAt: fromNullable(asset.fileCreatedAt),
  exifInfo: assetExifFromApi(asset.exifInfo),
})

const assetRecordToApi = (asset: AssetRecord): typeof AssetApi.Type => ({
  id: asset.id,
  type: asset.type,
  originalFileName: asset.originalFileName,
  fileCreatedAt: asset.fileCreatedAt,
  exifInfo: asset.exifInfo,
})

const albumInfoFromApi =
  (limit: number) =>
  (album: typeof AlbumInfoApi.Type): AlbumInfo => {
    const assets = fromNullable(album.assets) ?? []
    const records = assets.slice(0, limit).map(assetRecordFromApi)
    return {
      id: album.id,
      albumName: fromNullable(album.albumName),
      assetCount: fromNullable(album.assetCount),
      createdAt: fromNullable(album.createdAt),
      updatedAt: fromNullable(album.updatedAt),
      ownerId: fromNullable(album.ownerId),
      shared: fromNullable(album.shared),
      hasSharedLink: fromNullable(album.hasSharedLink),
      assets: listResult(records),
      moreAssetsAvailable: records.length < assets.length,
    }
  }

const albumInfoToApi = (album: AlbumInfo): typeof AlbumInfoApi.Type => ({
  id: album.id,
  albumName: album.albumName,
  assetCount: album.assetCount,
  createdAt: album.createdAt,
  updatedAt: album.updatedAt,
  ownerId: album.ownerId,
  shared: album.shared,
  hasSharedLink: album.hasSharedLink,
  assets: album.assets.records.map(assetRecordToApi),
})

export const AlbumInfoSchema = (limit: number) =>
  AlbumInfoApi.pipe(
    Schema.decodeTo(DomainAlbumInfo, {
      decode: SchemaGetter.transform(albumInfoFromApi(limit)),
      encode: SchemaGetter.transform(albumInfoToApi),
    })
  )

export const SearchResponseSchema = (mode: 'smart' | 'metadata', query: string) =>
  SearchResponseApi.pipe(
    Schema.decodeTo(DomainSearchResult, {
      decode: SchemaGetter.transform(
        (response: typeof SearchResponseApi.Type): SearchResult => ({
          mode,
          query,
          total: response.assets.total,
          count: response.assets.count,
          records: response.assets.items.map(assetRecordFromApi),
        })
      ),
      encode: SchemaGetter.transform((result: SearchResult) => ({
        assets: { total: result.total, count: result.count, items: result.records.map(assetRecordToApi) },
      })),
    })
  )

const personRecordFromApi = (person: typeof PersonApi.Type): PersonRecord => ({
  id: person.id,
  name: fromNullable(person.name),
  birthDate: fromNullable(person.birthDate),
  isFavorite: fromNullable(person.isFavorite),
  isHidden: fromNullable(person.isHidden),
  updatedAt: fromNullable(person.updatedAt),
})

const personRecordToApi = (person: PersonRecord): typeof PersonApi.Type => ({
  id: person.id,
  name: person.name,
  birthDate: person.birthDate,
  isFavorite: person.isFavorite,
  isHidden: person.isHidden,
  updatedAt: person.updatedAt,
})

export const PersonSchema = PersonApi.pipe(
  Schema.decodeTo(DomainPersonRecord, {
    decode: SchemaGetter.transform(personRecordFromApi),
    encode: SchemaGetter.transform(personRecordToApi),
  })
)

const peopleResultFromApi = (response: typeof PeopleResponseApi.Type): PeopleResult => {
  const records = response.people.map(personRecordFromApi)
  return {
    count: records.length,
    records,
    total: fromNullable(response.total),
    hidden: fromNullable(response.hidden),
    hasNextPage: fromNullable(response.hasNextPage),
  }
}

const peopleResultToApi = (result: PeopleResult): typeof PeopleResponseApi.Type => ({
  total: result.total,
  hidden: result.hidden,
  hasNextPage: result.hasNextPage,
  people: result.records.map(personRecordToApi),
})

export const PeopleResponseSchema = PeopleResponseApi.pipe(
  Schema.decodeTo(DomainPeopleResult, {
    decode: SchemaGetter.transform(peopleResultFromApi),
    encode: SchemaGetter.transform(peopleResultToApi),
  })
)

// oxlint-disable-next-line effect/prefer-option-over-null -- accepts the nullable wire jobCounts value directly; the package models absence with `T | undefined`, and Option here would not change the decoded JobCounts shape.
const jobCountsFromApi = (counts: typeof JobCountsApi.Type | null | undefined): JobCounts =>
  counts === null || counts === undefined
    ? {}
    : {
        active: fromNullable(counts.active),
        completed: fromNullable(counts.completed),
        failed: fromNullable(counts.failed),
        delayed: fromNullable(counts.delayed),
        waiting: fromNullable(counts.waiting),
        paused: fromNullable(counts.paused),
      }

const jobCountsToApi = (counts: JobCounts): typeof JobCountsApi.Type => ({
  active: counts.active,
  completed: counts.completed,
  failed: counts.failed,
  delayed: counts.delayed,
  waiting: counts.waiting,
  paused: counts.paused,
})

const jobRecordsFromApi = (jobs: typeof JobsApi.Type): ListResult<JobRecord> => {
  const records = R.toEntries(jobs).map(([queue, status]) => ({
    queue,
    paused: fromNullable(status.queueStatus?.isPaused),
    active: fromNullable(status.queueStatus?.isActive),
    counts: jobCountsFromApi(status.jobCounts),
  }))
  return listResult(records)
}

const jobRecordsToApi = (jobs: ListResult<JobRecord>): typeof JobsApi.Type =>
  R.fromEntries(
    jobs.records.map((job) => [
      job.queue,
      { queueStatus: { isPaused: job.paused, isActive: job.active }, jobCounts: jobCountsToApi(job.counts) },
    ])
  )

export const JobsSchema = JobsApi.pipe(
  Schema.decodeTo(DomainListResult(DomainJobRecord), {
    decode: SchemaGetter.transform(jobRecordsFromApi),
    encode: SchemaGetter.transform(jobRecordsToApi),
  })
)

const tagRecordFromApi = (tag: typeof TagApi.Type): TagRecord => ({
  id: tag.id,
  name: fromNullable(tag.name),
  value: fromNullable(tag.value),
})

const tagRecordToApi = (tag: TagRecord): typeof TagApi.Type => ({ id: tag.id, name: tag.name, value: tag.value })

export const TagSchema = TagApi.pipe(
  Schema.decodeTo(DomainTagRecord, {
    decode: SchemaGetter.transform(tagRecordFromApi),
    encode: SchemaGetter.transform(tagRecordToApi),
  })
)

export const usersResult = (records: ReadonlyArray<UserRecord>, note?: string): UsersResult => ({
  count: records.length,
  records,
  note,
})
