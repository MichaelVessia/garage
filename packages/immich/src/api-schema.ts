import { Schema, SchemaGetter } from 'effect'

import {
  AlbumInfoSchema as DomainAlbumInfoSchema,
  AlbumSummarySchema as DomainAlbumSummarySchema,
  CurrentUserSchema as DomainCurrentUserSchema,
  JobRecordSchema as DomainJobRecordSchema,
  ListResultSchema as DomainListResultSchema,
  PeopleResultSchema as DomainPeopleResultSchema,
  PersonRecordSchema as DomainPersonRecordSchema,
  SearchResultSchema as DomainSearchResultSchema,
  StatisticsSchema as DomainStatisticsSchema,
  StorageStatusSchema as DomainStorageStatusSchema,
  TagRecordSchema as DomainTagRecordSchema,
  UserRecordSchema as DomainUserRecordSchema,
  VersionPartsSchema as DomainVersionPartsSchema,
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

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))

const VersionApiSchema = Schema.Struct({ major: Schema.Number, minor: Schema.Number, patch: Schema.Number })
export const VersionSchema = VersionApiSchema.pipe(Schema.decodeTo(DomainVersionPartsSchema))

export const PingSchema = Schema.Struct({ res: NullableString })

const StatisticsUserSchema = Schema.Struct({
  userId: Schema.String,
  userName: NullableString,
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  quotaSizeInBytes: NullableNumber,
})

const StatisticsApiSchema = Schema.Struct({
  photos: Schema.Number,
  videos: Schema.Number,
  usage: Schema.Number,
  usagePhotos: Schema.Number,
  usageVideos: Schema.Number,
  usageByUser: Schema.Array(StatisticsUserSchema),
})

const StorageApiSchema = Schema.Struct({
  diskSize: NullableString,
  diskUse: NullableString,
  diskAvailable: NullableString,
  diskSizeRaw: NullableNumber,
  diskUseRaw: NullableNumber,
  diskAvailableRaw: NullableNumber,
  diskUsagePercentage: NullableNumber,
})

const UserApiSchema = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  email: NullableString,
  isAdmin: NullableBoolean,
  quotaSizeInBytes: NullableNumber,
  quotaUsageInBytes: NullableNumber,
  status: NullableString,
  storageLabel: NullableString,
})

const AlbumApiSchema = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
})

const ExifSchema = Schema.Struct({ make: NullableString, model: NullableString })

const AssetApiSchema = Schema.Struct({
  id: Schema.String,
  type: NullableString,
  originalFileName: NullableString,
  fileCreatedAt: NullableString,
  exifInfo: Schema.optional(Schema.NullOr(ExifSchema)),
})

const AlbumInfoApiSchema = Schema.Struct({
  id: Schema.String,
  albumName: NullableString,
  assetCount: NullableNumber,
  createdAt: NullableString,
  updatedAt: NullableString,
  ownerId: NullableString,
  shared: NullableBoolean,
  hasSharedLink: NullableBoolean,
  assets: Schema.optional(Schema.NullOr(Schema.Array(AssetApiSchema))),
})

const SearchAssetsSchema = Schema.Struct({
  total: Schema.Number,
  count: Schema.Number,
  items: Schema.Array(AssetApiSchema),
})
const SearchResponseApiSchema = Schema.Struct({ assets: SearchAssetsSchema })

const PersonApiSchema = Schema.Struct({
  id: Schema.String,
  name: NullableString,
  birthDate: NullableString,
  isFavorite: NullableBoolean,
  isHidden: NullableBoolean,
  updatedAt: NullableString,
})

const PeopleResponseApiSchema = Schema.Struct({
  total: NullableNumber,
  hidden: NullableNumber,
  hasNextPage: NullableBoolean,
  people: Schema.Array(PersonApiSchema),
})

const JobCountsApiSchema = Schema.Struct({
  active: NullableNumber,
  completed: NullableNumber,
  failed: NullableNumber,
  delayed: NullableNumber,
  waiting: NullableNumber,
  paused: NullableNumber,
})

const QueueStatusSchema = Schema.Struct({ isPaused: NullableBoolean, isActive: NullableBoolean })

const JobStatusSchema = Schema.Struct({
  queueStatus: Schema.optional(Schema.NullOr(QueueStatusSchema)),
  jobCounts: Schema.optional(Schema.NullOr(JobCountsApiSchema)),
})

const JobsApiSchema = Schema.Record(Schema.String, JobStatusSchema)

const TagApiSchema = Schema.Struct({ id: Schema.String, name: NullableString, value: NullableString })

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const statisticsFromApi = (stats: typeof StatisticsApiSchema.Type): Statistics => ({
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

const statisticsToApi = (stats: Statistics): typeof StatisticsApiSchema.Type => ({
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

export const StatisticsSchema = StatisticsApiSchema.pipe(
  Schema.decodeTo(DomainStatisticsSchema, {
    decode: SchemaGetter.transform(statisticsFromApi),
    encode: SchemaGetter.transform(statisticsToApi),
  })
)

const storageFromApi = (storage: typeof StorageApiSchema.Type): StorageStatus => ({
  diskSize: fromNullable(storage.diskSize),
  diskUse: fromNullable(storage.diskUse),
  diskAvailable: fromNullable(storage.diskAvailable),
  diskSizeRaw: fromNullable(storage.diskSizeRaw),
  diskUseRaw: fromNullable(storage.diskUseRaw),
  diskAvailableRaw: fromNullable(storage.diskAvailableRaw),
  diskUsagePercentage: fromNullable(storage.diskUsagePercentage),
})

const storageToApi = (storage: StorageStatus): typeof StorageApiSchema.Type => ({
  diskSize: storage.diskSize,
  diskUse: storage.diskUse,
  diskAvailable: storage.diskAvailable,
  diskSizeRaw: storage.diskSizeRaw,
  diskUseRaw: storage.diskUseRaw,
  diskAvailableRaw: storage.diskAvailableRaw,
  diskUsagePercentage: storage.diskUsagePercentage,
})

export const StorageSchema = StorageApiSchema.pipe(
  Schema.decodeTo(DomainStorageStatusSchema, {
    decode: SchemaGetter.transform(storageFromApi),
    encode: SchemaGetter.transform(storageToApi),
  })
)

const userRecordFromApi = (user: typeof UserApiSchema.Type): UserRecord => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
  status: fromNullable(user.status),
})

const userRecordToApi = (user: UserRecord): typeof UserApiSchema.Type => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  quotaSizeInBytes: user.quotaSizeInBytes,
  quotaUsageInBytes: user.quotaUsageInBytes,
  status: user.status,
})

export const UserSchema = UserApiSchema.pipe(
  Schema.decodeTo(DomainUserRecordSchema, {
    decode: SchemaGetter.transform(userRecordFromApi),
    encode: SchemaGetter.transform(userRecordToApi),
  })
)

const currentUserFromApi = (user: typeof UserApiSchema.Type): CurrentUser => ({
  id: user.id,
  name: fromNullable(user.name),
  email: fromNullable(user.email),
  isAdmin: fromNullable(user.isAdmin),
  storageLabel: fromNullable(user.storageLabel),
  quotaSizeInBytes: fromNullable(user.quotaSizeInBytes),
  quotaUsageInBytes: fromNullable(user.quotaUsageInBytes),
})

const currentUserToApi = (user: CurrentUser): typeof UserApiSchema.Type => ({
  id: user.id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  storageLabel: user.storageLabel,
  quotaSizeInBytes: user.quotaSizeInBytes,
  quotaUsageInBytes: user.quotaUsageInBytes,
})

export const CurrentUserSchema = UserApiSchema.pipe(
  Schema.decodeTo(DomainCurrentUserSchema, {
    decode: SchemaGetter.transform(currentUserFromApi),
    encode: SchemaGetter.transform(currentUserToApi),
  })
)

const albumSummaryFromApi = (album: typeof AlbumApiSchema.Type): AlbumSummary => ({
  id: album.id,
  albumName: fromNullable(album.albumName),
  assetCount: fromNullable(album.assetCount),
  createdAt: fromNullable(album.createdAt),
  ownerId: fromNullable(album.ownerId),
})

const albumSummaryToApi = (album: AlbumSummary): typeof AlbumApiSchema.Type => ({
  id: album.id,
  albumName: album.albumName,
  assetCount: album.assetCount,
  createdAt: album.createdAt,
  ownerId: album.ownerId,
})

export const AlbumSchema = AlbumApiSchema.pipe(
  Schema.decodeTo(DomainAlbumSummarySchema, {
    decode: SchemaGetter.transform(albumSummaryFromApi),
    encode: SchemaGetter.transform(albumSummaryToApi),
  })
)

const assetExifFromApi = (exif: typeof ExifSchema.Type | null | undefined): AssetExif | undefined =>
  exif === null || exif === undefined ? undefined : { make: fromNullable(exif.make), model: fromNullable(exif.model) }

const assetRecordFromApi = (asset: typeof AssetApiSchema.Type): AssetRecord => ({
  id: asset.id,
  type: fromNullable(asset.type),
  originalFileName: fromNullable(asset.originalFileName),
  fileCreatedAt: fromNullable(asset.fileCreatedAt),
  exifInfo: assetExifFromApi(asset.exifInfo),
})

const assetRecordToApi = (asset: AssetRecord): typeof AssetApiSchema.Type => ({
  id: asset.id,
  type: asset.type,
  originalFileName: asset.originalFileName,
  fileCreatedAt: asset.fileCreatedAt,
  exifInfo: asset.exifInfo,
})

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({ count: records.length, records })

const albumInfoFromApi =
  (limit: number) =>
  (album: typeof AlbumInfoApiSchema.Type): AlbumInfo => {
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

const albumInfoToApi = (album: AlbumInfo): typeof AlbumInfoApiSchema.Type => ({
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
  AlbumInfoApiSchema.pipe(
    Schema.decodeTo(DomainAlbumInfoSchema, {
      decode: SchemaGetter.transform(albumInfoFromApi(limit)),
      encode: SchemaGetter.transform(albumInfoToApi),
    })
  )

export const SearchResponseSchema = (mode: 'smart' | 'metadata', query: string) =>
  SearchResponseApiSchema.pipe(
    Schema.decodeTo(DomainSearchResultSchema, {
      decode: SchemaGetter.transform(
        (response: typeof SearchResponseApiSchema.Type): SearchResult => ({
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

const personRecordFromApi = (person: typeof PersonApiSchema.Type): PersonRecord => ({
  id: person.id,
  name: fromNullable(person.name),
  birthDate: fromNullable(person.birthDate),
  isFavorite: fromNullable(person.isFavorite),
  isHidden: fromNullable(person.isHidden),
  updatedAt: fromNullable(person.updatedAt),
})

const personRecordToApi = (person: PersonRecord): typeof PersonApiSchema.Type => ({
  id: person.id,
  name: person.name,
  birthDate: person.birthDate,
  isFavorite: person.isFavorite,
  isHidden: person.isHidden,
  updatedAt: person.updatedAt,
})

export const PersonSchema = PersonApiSchema.pipe(
  Schema.decodeTo(DomainPersonRecordSchema, {
    decode: SchemaGetter.transform(personRecordFromApi),
    encode: SchemaGetter.transform(personRecordToApi),
  })
)

const peopleResultFromApi = (response: typeof PeopleResponseApiSchema.Type): PeopleResult => {
  const records = response.people.map(personRecordFromApi)
  return {
    count: records.length,
    records,
    total: fromNullable(response.total),
    hidden: fromNullable(response.hidden),
    hasNextPage: fromNullable(response.hasNextPage),
  }
}

const peopleResultToApi = (result: PeopleResult): typeof PeopleResponseApiSchema.Type => ({
  total: result.total,
  hidden: result.hidden,
  hasNextPage: result.hasNextPage,
  people: result.records.map(personRecordToApi),
})

export const PeopleResponseSchema = PeopleResponseApiSchema.pipe(
  Schema.decodeTo(DomainPeopleResultSchema, {
    decode: SchemaGetter.transform(peopleResultFromApi),
    encode: SchemaGetter.transform(peopleResultToApi),
  })
)

const jobCountsFromApi = (counts: typeof JobCountsApiSchema.Type | null | undefined): JobCounts =>
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

const jobCountsToApi = (counts: JobCounts): typeof JobCountsApiSchema.Type => ({
  active: counts.active,
  completed: counts.completed,
  failed: counts.failed,
  delayed: counts.delayed,
  waiting: counts.waiting,
  paused: counts.paused,
})

const jobRecordsFromApi = (jobs: typeof JobsApiSchema.Type): ListResult<JobRecord> => {
  const records = Object.entries(jobs).map(([queue, status]) => ({
    queue,
    paused: fromNullable(status.queueStatus?.isPaused),
    active: fromNullable(status.queueStatus?.isActive),
    counts: jobCountsFromApi(status.jobCounts),
  }))
  return listResult(records)
}

const jobRecordsToApi = (jobs: ListResult<JobRecord>): typeof JobsApiSchema.Type =>
  Object.fromEntries(
    jobs.records.map((job) => [
      job.queue,
      { queueStatus: { isPaused: job.paused, isActive: job.active }, jobCounts: jobCountsToApi(job.counts) },
    ])
  )

export const JobsSchema = JobsApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainJobRecordSchema), {
    decode: SchemaGetter.transform(jobRecordsFromApi),
    encode: SchemaGetter.transform(jobRecordsToApi),
  })
)

const tagRecordFromApi = (tag: typeof TagApiSchema.Type): TagRecord => ({
  id: tag.id,
  name: fromNullable(tag.name),
  value: fromNullable(tag.value),
})

const tagRecordToApi = (tag: TagRecord): typeof TagApiSchema.Type => ({ id: tag.id, name: tag.name, value: tag.value })

export const TagSchema = TagApiSchema.pipe(
  Schema.decodeTo(DomainTagRecordSchema, {
    decode: SchemaGetter.transform(tagRecordFromApi),
    encode: SchemaGetter.transform(tagRecordToApi),
  })
)

export const usersResult = (records: ReadonlyArray<UserRecord>, note?: string): UsersResult => ({
  count: records.length,
  records,
  note,
})

export const recordsList = listResult
