import { Schema } from 'effect'

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
  SystemStatus,
  TagRecord,
  UserRecord,
  UsersResult,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))

export const VersionSchema = Schema.Struct({
  major: Schema.Number,
  minor: Schema.Number,
  patch: Schema.Number,
})

export const PingSchema = Schema.Struct({
  res: NullableString,
})

export const StatisticsUserSchema = Schema.Struct({
  userId: Schema.String,
  userName: NullableString,
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  quotaSizeInBytes: NullableNumber,
})

export const StatisticsSchema = Schema.Struct({
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  usagePhotos: Schema.Number,
  usageVideos: Schema.Number,
  usageByUser: Schema.Array(StatisticsUserSchema),
})

export const StorageSchema = Schema.Struct({
  diskSize: NullableString,
  diskUse: NullableString,
  diskAvailable: NullableString,
  diskSizeRaw: NullableNumber,
  diskUseRaw: NullableNumber,
  diskAvailableRaw: NullableNumber,
  diskUsagePercentage: NullableNumber,
})

export const UserSchema = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  email: NullableString,
  isAdmin: NullableBoolean,
  quotaSizeInBytes: NullableNumber,
  quotaUsageInBytes: NullableNumber,
  status: NullableString,
  storageLabel: NullableString,
})

export const AlbumSchema = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
})

const ExifSchema = Schema.Struct({
  make: NullableString,
  model: NullableString,
})

export const AssetSchema = Schema.Struct({
  id: Schema.String,
  type: NullableString,
  originalFileName: NullableString,
  fileCreatedAt: NullableString,
  exifInfo: Schema.optional(Schema.NullOr(ExifSchema)),
})

export const AlbumInfoSchema = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
  assets: Schema.optional(Schema.NullOr(Schema.Array(AssetSchema))),
})

const SearchAssetsSchema = Schema.Struct({
  total: Schema.Number,
  count: Schema.Number,
  items: Schema.Array(AssetSchema),
})

export const SearchResponseSchema = Schema.Struct({
  assets: SearchAssetsSchema,
})

export const PersonSchema = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  birthDate: NullableString,
  isFavorite: NullableBoolean,
  isHidden: NullableBoolean,
  updatedAt: NullableString,
})

export const PeopleResponseSchema = Schema.Struct({
  total: NullableNumber,
  hidden: NullableNumber,
  hasNextPage: NullableBoolean,
  people: Schema.Array(PersonSchema),
})

export const JobCountsSchema = Schema.Struct({
  active: NullableNumber,
  completed: NullableNumber,
  failed: NullableNumber,
  delayed: NullableNumber,
  waiting: NullableNumber,
  paused: NullableNumber,
})

const QueueStatusSchema = Schema.Struct({
  isPaused: NullableBoolean,
  isActive: NullableBoolean,
})

export const JobStatusSchema = Schema.Struct({
  queueStatus: Schema.optional(Schema.NullOr(QueueStatusSchema)),
  jobCounts: Schema.optional(Schema.NullOr(JobCountsSchema)),
})

export const JobsSchema = Schema.Record(Schema.String, JobStatusSchema)

export const TagSchema = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  value: NullableString,
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

export const toSystemStatus = (
  versionParts: typeof VersionSchema.Type,
  ping: typeof PingSchema.Type
): SystemStatus => ({
  version: `${versionParts.major}.${versionParts.minor}.${versionParts.patch}`,
  versionParts,
  ping: fromNullable(ping.res),
})

export const toStatistics = (stats: typeof StatisticsSchema.Type): Statistics => ({
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

export const toStorageStatus = (storage: typeof StorageSchema.Type): StorageStatus => ({
  diskSize: fromNullable(storage.diskSize),
  diskUse: fromNullable(storage.diskUse),
  diskAvailable: fromNullable(storage.diskAvailable),
  diskSizeRaw: fromNullable(storage.diskSizeRaw),
  diskUseRaw: fromNullable(storage.diskUseRaw),
  diskAvailableRaw: fromNullable(storage.diskAvailableRaw),
  diskUsagePercentage: fromNullable(storage.diskUsagePercentage),
})

export const toUserRecord = (user: typeof UserSchema.Type): UserRecord => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
  status: fromNullable(user.status),
})

export const toCurrentUser = (user: typeof UserSchema.Type): CurrentUser => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  storageLabel: fromNullable(user.storageLabel),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
})

export const toAlbumSummary = (album: typeof AlbumSchema.Type): AlbumSummary => ({
  id: album.id,
  albumName: fromNullable(album.albumName),
  assetCount: fromNullable(album.assetCount),
  createdAt: fromNullable(album.createdAt),
  ownerId: fromNullable(album.ownerId),
})

const toAssetExif = (exif: typeof ExifSchema.Type | null | undefined): AssetExif | undefined =>
  exif === null || exif === undefined ? undefined : { make: fromNullable(exif.make), model: fromNullable(exif.model) }

export const toAssetRecord = (asset: typeof AssetSchema.Type): AssetRecord => ({
  id: asset.id,
  type: fromNullable(asset.type),
  originalFileName: fromNullable(asset.originalFileName),
  fileCreatedAt: fromNullable(asset.fileCreatedAt),
  exifInfo: toAssetExif(asset.exifInfo),
})

export const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

export const toAlbumInfo = (album: typeof AlbumInfoSchema.Type, limit: number): AlbumInfo => {
  const assets = fromNullable(album.assets) ?? []
  const records = assets.slice(0, limit).map(toAssetRecord)
  return {
    id: album.id,
    albumName: fromNullable(album.albumName),
    assetCount: fromNullable(album.assetCount),
    createdAt: fromNullable(album.createdAt),
    updatedAt: fromNullable(album.updatedAt),
    ownerId: fromNullable(album.ownerId),
    shared: fromNullable(album.shared),
    hasSharedLink: fromNullable(album.hasSharedLink),
    assets: toListResult(records),
    moreAssetsAvailable: records.length < assets.length,
  }
}

export const toSearchResult = (
  mode: 'smart' | 'metadata',
  query: string,
  response: typeof SearchResponseSchema.Type
): SearchResult => ({
  mode,
  query,
  total: response.assets.total,
  count: response.assets.count,
  records: response.assets.items.map(toAssetRecord),
})

export const toPersonRecord = (person: typeof PersonSchema.Type): PersonRecord => ({
  id: person.id,
  name: fromNullable(person.name),
  birthDate: fromNullable(person.birthDate),
  isFavorite: fromNullable(person.isFavorite),
  isHidden: fromNullable(person.isHidden),
  updatedAt: fromNullable(person.updatedAt),
})

export const toPeopleResult = (response: typeof PeopleResponseSchema.Type): PeopleResult => {
  const records = response.people.map(toPersonRecord)
  return {
    count: records.length,
    records,
    total: fromNullable(response.total),
    hidden: fromNullable(response.hidden),
    hasNextPage: fromNullable(response.hasNextPage),
  }
}

const toJobCounts = (counts: typeof JobCountsSchema.Type | null | undefined): JobCounts =>
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

export const toJobRecords = (jobs: typeof JobsSchema.Type): ReadonlyArray<JobRecord> =>
  Object.entries(jobs).map(([queue, status]) => ({
    queue,
    paused: fromNullable(status.queueStatus?.isPaused),
    active: fromNullable(status.queueStatus?.isActive),
    counts: toJobCounts(status.jobCounts),
  }))

export const toTagRecord = (tag: typeof TagSchema.Type): TagRecord => ({
  id: tag.id,
  name: fromNullable(tag.name),
  value: fromNullable(tag.value),
})

export const toUsersResult = (records: ReadonlyArray<UserRecord>, note?: string | undefined): UsersResult => ({
  count: records.length,
  records,
  note,
})
