import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const ImmichConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type ImmichConfigValue = typeof ImmichConfigValueSchema.Type

export const VersionPartsSchema = Schema.Struct({
  major: Schema.Number,
  minor: Schema.Number,
  patch: Schema.Number,
})
export type VersionParts = typeof VersionPartsSchema.Type

export const SystemStatusSchema = Schema.Struct({
  version: Schema.String,
  versionParts: VersionPartsSchema,
  ping: OptionalString,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const UserUsageRecordSchema = Schema.Struct({
  userId: Schema.String,
  userName: OptionalString,
  photos: Schema.Number,
  videos: Schema.Number,
  usageBytes: Schema.Number,
  quotaSizeInBytes: OptionalNumber,
})
export type UserUsageRecord = typeof UserUsageRecordSchema.Type

export const StatisticsSchema = Schema.Struct({
  photos: Schema.Number,
  videos: Schema.Number,
  usageBytes: Schema.Number,
  usagePhotosBytes: Schema.Number,
  usageVideosBytes: Schema.Number,
  perUser: Schema.Array(UserUsageRecordSchema),
})
export type Statistics = typeof StatisticsSchema.Type

export const StorageStatusSchema = Schema.Struct({
  diskSize: OptionalString,
  diskUse: OptionalString,
  diskAvailable: OptionalString,
  diskSizeRaw: OptionalNumber,
  diskUseRaw: OptionalNumber,
  diskAvailableRaw: OptionalNumber,
  diskUsagePercentage: OptionalNumber,
})
export type StorageStatus = typeof StorageStatusSchema.Type

export const UserRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  email: OptionalString,
  isAdmin: OptionalBoolean,
  quotaSizeInBytes: OptionalNumber,
  quotaUsageInBytes: OptionalNumber,
  status: OptionalString,
})
export type UserRecord = typeof UserRecordSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const UsersResultSchema = Schema.Struct({
  ...ListResultSchema(UserRecordSchema).fields,
  note: OptionalString,
})
export type UsersResult = typeof UsersResultSchema.Type

export const CurrentUserSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  email: OptionalString,
  isAdmin: OptionalBoolean,
  storageLabel: OptionalString,
  quotaSizeInBytes: OptionalNumber,
  quotaUsageInBytes: OptionalNumber,
})
export type CurrentUser = typeof CurrentUserSchema.Type

export const AlbumSummarySchema = Schema.Struct({
  id: Schema.String,
  albumName: OptionalString,
  assetCount: OptionalNumber,
  createdAt: OptionalString,
  ownerId: OptionalString,
})
export type AlbumSummary = typeof AlbumSummarySchema.Type

export const AssetExifSchema = Schema.Struct({
  make: OptionalString,
  model: OptionalString,
})
export type AssetExif = typeof AssetExifSchema.Type

export const AssetRecordSchema = Schema.Struct({
  id: Schema.String,
  type: OptionalString,
  originalFileName: OptionalString,
  fileCreatedAt: OptionalString,
  exifInfo: Schema.optional(AssetExifSchema),
})
export type AssetRecord = typeof AssetRecordSchema.Type

export const AlbumInfoSchema = Schema.Struct({
  id: Schema.String,
  albumName: OptionalString,
  assetCount: OptionalNumber,
  createdAt: OptionalString,
  updatedAt: OptionalString,
  ownerId: OptionalString,
  shared: OptionalBoolean,
  hasSharedLink: OptionalBoolean,
  assets: ListResultSchema(AssetRecordSchema),
  moreAssetsAvailable: Schema.Boolean,
})
export type AlbumInfo = typeof AlbumInfoSchema.Type

export const SearchModeSchema = Schema.Literals(['smart', 'metadata'])
export const SearchResultSchema = Schema.Struct({
  mode: SearchModeSchema,
  query: Schema.String,
  total: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(AssetRecordSchema),
})
export type SearchResult = typeof SearchResultSchema.Type

export const PersonRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  birthDate: OptionalString,
  isFavorite: OptionalBoolean,
  isHidden: OptionalBoolean,
  updatedAt: OptionalString,
})
export type PersonRecord = typeof PersonRecordSchema.Type

export const PeopleResultSchema = Schema.Struct({
  ...ListResultSchema(PersonRecordSchema).fields,
  total: OptionalNumber,
  hidden: OptionalNumber,
  hasNextPage: OptionalBoolean,
})
export type PeopleResult = typeof PeopleResultSchema.Type

export const JobCountsSchema = Schema.Struct({
  active: OptionalNumber,
  completed: OptionalNumber,
  failed: OptionalNumber,
  delayed: OptionalNumber,
  waiting: OptionalNumber,
  paused: OptionalNumber,
})
export type JobCounts = typeof JobCountsSchema.Type

export const JobRecordSchema = Schema.Struct({
  queue: Schema.String,
  paused: OptionalBoolean,
  active: OptionalBoolean,
  counts: JobCountsSchema,
})
export type JobRecord = typeof JobRecordSchema.Type

export const TagRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  value: OptionalString,
})
export type TagRecord = typeof TagRecordSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const AlbumInfoOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  id: Schema.String,
})
export type AlbumInfoOptions = typeof AlbumInfoOptionsSchema.Type
