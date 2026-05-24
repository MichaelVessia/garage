export interface ImmichConfigValue {
  readonly url: string
  readonly apiKey: string
}

export interface VersionParts {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

export interface SystemStatus {
  readonly version: string
  readonly versionParts: VersionParts
  readonly ping?: string | undefined
}

export interface UserUsageRecord {
  readonly userId: string
  readonly userName?: string | undefined
  readonly photos: number
  readonly videos: number
  readonly usageBytes: number
  readonly quotaSizeInBytes?: number | undefined
}

export interface Statistics {
  readonly photos: number
  readonly videos: number
  readonly usageBytes: number
  readonly usagePhotosBytes: number
  readonly usageVideosBytes: number
  readonly perUser: ReadonlyArray<UserUsageRecord>
}

export interface StorageStatus {
  readonly diskSize?: string | undefined
  readonly diskUse?: string | undefined
  readonly diskAvailable?: string | undefined
  readonly diskSizeRaw?: number | undefined
  readonly diskUseRaw?: number | undefined
  readonly diskAvailableRaw?: number | undefined
  readonly diskUsagePercentage?: number | undefined
}

export interface UserRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly email?: string | undefined
  readonly isAdmin?: boolean | undefined
  readonly quotaSizeInBytes?: number | undefined
  readonly quotaUsageInBytes?: number | undefined
  readonly status?: string | undefined
}

export interface UsersResult extends ListResult<UserRecord> {
  readonly note?: string | undefined
}

export interface CurrentUser {
  readonly id: string
  readonly name?: string | undefined
  readonly email?: string | undefined
  readonly isAdmin?: boolean | undefined
  readonly storageLabel?: string | undefined
  readonly quotaSizeInBytes?: number | undefined
  readonly quotaUsageInBytes?: number | undefined
}

export interface AlbumSummary {
  readonly id: string
  readonly albumName?: string | undefined
  readonly assetCount?: number | undefined
  readonly createdAt?: string | undefined
  readonly ownerId?: string | undefined
}

export interface AssetExif {
  readonly make?: string | undefined
  readonly model?: string | undefined
}

export interface AssetRecord {
  readonly id: string
  readonly type?: string | undefined
  readonly originalFileName?: string | undefined
  readonly fileCreatedAt?: string | undefined
  readonly exifInfo?: AssetExif | undefined
}

export interface AlbumInfo {
  readonly id: string
  readonly albumName?: string | undefined
  readonly assetCount?: number | undefined
  readonly createdAt?: string | undefined
  readonly updatedAt?: string | undefined
  readonly ownerId?: string | undefined
  readonly shared?: boolean | undefined
  readonly hasSharedLink?: boolean | undefined
  readonly assets: ListResult<AssetRecord>
  readonly moreAssetsAvailable: boolean
}

export interface SearchResult {
  readonly mode: 'smart' | 'metadata'
  readonly query: string
  readonly total: number
  readonly count: number
  readonly records: ReadonlyArray<AssetRecord>
}

export interface PersonRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly birthDate?: string | undefined
  readonly isFavorite?: boolean | undefined
  readonly isHidden?: boolean | undefined
  readonly updatedAt?: string | undefined
}

export interface PeopleResult extends ListResult<PersonRecord> {
  readonly total?: number | undefined
  readonly hidden?: number | undefined
  readonly hasNextPage?: boolean | undefined
}

export interface JobCounts {
  readonly active?: number | undefined
  readonly completed?: number | undefined
  readonly failed?: number | undefined
  readonly delayed?: number | undefined
  readonly waiting?: number | undefined
  readonly paused?: number | undefined
}

export interface JobRecord {
  readonly queue: string
  readonly paused?: boolean | undefined
  readonly active?: boolean | undefined
  readonly counts: JobCounts
}

export interface TagRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly value?: string | undefined
}

export interface LimitOptions {
  readonly limit: number
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface AlbumInfoOptions extends LimitOptions {
  readonly id: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
