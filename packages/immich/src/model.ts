import { ListResultSchema } from '@garage/cli-protocol'
import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const ImmichConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type ImmichConfigValue = typeof ImmichConfigValue.Type

export const VersionParts = Schema.Struct({
  major: Schema.Number,
  minor: Schema.Number,
  patch: Schema.Number,
})
export type VersionParts = typeof VersionParts.Type

export const SystemStatus = Schema.Struct({
  version: Schema.String,
  versionParts: VersionParts,
  ping: OptionalString,
})
export type SystemStatus = typeof SystemStatus.Type

export const UserUsageRecord = Schema.Struct({
  userId: Schema.String,
  userName: OptionalString,
  photos: Schema.Number,
  videos: Schema.Number,
  usageBytes: Schema.Number,
  quotaSizeInBytes: OptionalNumber,
})
export type UserUsageRecord = typeof UserUsageRecord.Type

export const Statistics = Schema.Struct({
  photos: Schema.Number,
  videos: Schema.Number,
  usageBytes: Schema.Number,
  usagePhotosBytes: Schema.Number,
  usageVideosBytes: Schema.Number,
  perUser: Schema.Array(UserUsageRecord),
})
export type Statistics = typeof Statistics.Type

export const StorageStatus = Schema.Struct({
  diskSize: OptionalString,
  diskUse: OptionalString,
  diskAvailable: OptionalString,
  diskSizeRaw: OptionalNumber,
  diskUseRaw: OptionalNumber,
  diskAvailableRaw: OptionalNumber,
  diskUsagePercentage: OptionalNumber,
})
export type StorageStatus = typeof StorageStatus.Type

export const UserRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  email: OptionalString,
  isAdmin: OptionalBoolean,
  quotaSizeInBytes: OptionalNumber,
  quotaUsageInBytes: OptionalNumber,
  status: OptionalString,
})
export type UserRecord = typeof UserRecord.Type

export const ListResult = ListResultSchema
export type ListResult<Record> = ListResultSchema<Record>

export const UsersResult = Schema.Struct({
  ...ListResult(UserRecord).fields,
  note: OptionalString,
})
export type UsersResult = typeof UsersResult.Type

export const CurrentUser = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  email: OptionalString,
  isAdmin: OptionalBoolean,
  storageLabel: OptionalString,
  quotaSizeInBytes: OptionalNumber,
  quotaUsageInBytes: OptionalNumber,
})
export type CurrentUser = typeof CurrentUser.Type

export const AlbumSummary = Schema.Struct({
  id: Schema.String,
  albumName: OptionalString,
  assetCount: OptionalNumber,
  createdAt: OptionalString,
  ownerId: OptionalString,
})
export type AlbumSummary = typeof AlbumSummary.Type

export const AssetExif = Schema.Struct({
  make: OptionalString,
  model: OptionalString,
})
export type AssetExif = typeof AssetExif.Type

export const AssetRecord = Schema.Struct({
  id: Schema.String,
  type: OptionalString,
  originalFileName: OptionalString,
  fileCreatedAt: OptionalString,
  exifInfo: Schema.optional(AssetExif),
})
export type AssetRecord = typeof AssetRecord.Type

export const AlbumInfo = Schema.Struct({
  id: Schema.String,
  albumName: OptionalString,
  assetCount: OptionalNumber,
  createdAt: OptionalString,
  updatedAt: OptionalString,
  ownerId: OptionalString,
  shared: OptionalBoolean,
  hasSharedLink: OptionalBoolean,
  assets: ListResult(AssetRecord),
  moreAssetsAvailable: Schema.Boolean,
})
export type AlbumInfo = typeof AlbumInfo.Type

export const SearchMode = Schema.Literals(['smart', 'metadata'])
export type SearchMode = typeof SearchMode.Type
export const SearchResult = Schema.Struct({
  mode: SearchMode,
  query: Schema.String,
  total: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(AssetRecord),
})
export type SearchResult = typeof SearchResult.Type

export const PersonRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  birthDate: OptionalString,
  isFavorite: OptionalBoolean,
  isHidden: OptionalBoolean,
  updatedAt: OptionalString,
})
export type PersonRecord = typeof PersonRecord.Type

export const PeopleResult = Schema.Struct({
  ...ListResult(PersonRecord).fields,
  total: OptionalNumber,
  hidden: OptionalNumber,
  hasNextPage: OptionalBoolean,
})
export type PeopleResult = typeof PeopleResult.Type

export const JobCounts = Schema.Struct({
  active: OptionalNumber,
  completed: OptionalNumber,
  failed: OptionalNumber,
  delayed: OptionalNumber,
  waiting: OptionalNumber,
  paused: OptionalNumber,
})
export type JobCounts = typeof JobCounts.Type

export const JobRecord = Schema.Struct({
  queue: Schema.String,
  paused: OptionalBoolean,
  active: OptionalBoolean,
  counts: JobCounts,
})
export type JobRecord = typeof JobRecord.Type

export const TagRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  value: OptionalString,
})
export type TagRecord = typeof TagRecord.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const AlbumInfoOptions = Schema.Struct({
  limit: Schema.Number,
  id: Schema.String,
})
export type AlbumInfoOptions = typeof AlbumInfoOptions.Type
