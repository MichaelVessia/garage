export interface RadarrConfigValue {
  readonly url: string
  readonly apiKey: string
  readonly defaultQualityProfileId: number
}

export interface SystemStatus {
  readonly appName?: string | undefined
  readonly version: string
  readonly instanceName?: string | undefined
  readonly branch?: string | undefined
  readonly runtimeVersion?: string | undefined
  readonly startupPath?: string | undefined
  readonly appData?: string | undefined
  readonly osName?: string | undefined
  readonly osVersion?: string | undefined
  readonly isLinux?: boolean | undefined
  readonly isDocker?: boolean | undefined
}

export interface RootFolder {
  readonly id: number
  readonly path: string
  readonly freeSpace?: number | undefined
  readonly accessible?: boolean | undefined
  readonly unmappedFolderCount?: number | undefined
}

export interface QualityProfile {
  readonly id: number
  readonly name: string
  readonly isDefault?: boolean | undefined
  readonly upgradeAllowed?: boolean | undefined
  readonly cutoff?: number | undefined
  readonly minFormatScore?: number | undefined
  readonly cutoffFormatScore?: number | undefined
}

export interface MovieCollectionSummary {
  readonly tmdbId: number
  readonly title: string
}

export interface MovieLookupResult {
  readonly title: string
  readonly year?: number | undefined
  readonly tmdbId: number
  readonly tmdbUrl: string
  readonly titleSlug?: string | undefined
  readonly imdbId?: string | undefined
  readonly status?: string | undefined
  readonly overview?: string | undefined
  readonly runtime?: number | undefined
  readonly certification?: string | undefined
  readonly genres?: ReadonlyArray<string> | undefined
  readonly studio?: string | undefined
  readonly inCinemas?: string | undefined
  readonly physicalRelease?: string | undefined
  readonly digitalRelease?: string | undefined
  readonly remotePoster?: string | undefined
  readonly collection?: MovieCollectionSummary | undefined
}

export interface MovieRecord {
  readonly id: number
  readonly title: string
  readonly year?: number | undefined
  readonly tmdbId: number
  readonly path?: string | undefined
  readonly monitored?: boolean | undefined
  readonly status?: string | undefined
  readonly hasFile?: boolean | undefined
  readonly qualityProfileId?: number | undefined
  readonly qualityProfileName?: string | undefined
  readonly minimumAvailability?: string | undefined
  readonly isAvailable?: boolean | undefined
  readonly sizeOnDisk?: number | undefined
  readonly inCinemas?: string | undefined
  readonly physicalRelease?: string | undefined
  readonly digitalRelease?: string | undefined
  readonly added?: string | undefined
  readonly studio?: string | undefined
  readonly runtime?: number | undefined
  readonly certification?: string | undefined
  readonly genres?: ReadonlyArray<string> | undefined
}

export interface MovieReleaseRecord {
  readonly id?: number | undefined
  readonly title: string
  readonly year?: number | undefined
  readonly tmdbId?: number | undefined
  readonly inCinemas?: string | undefined
  readonly physicalRelease?: string | undefined
  readonly digitalRelease?: string | undefined
  readonly hasFile?: boolean | undefined
  readonly monitored?: boolean | undefined
  readonly status?: string | undefined
  readonly isAvailable?: boolean | undefined
}

export interface QueueRecord {
  readonly id?: number | undefined
  readonly title: string
  readonly movieTitle?: string | undefined
  readonly year?: number | undefined
  readonly status: string
  readonly trackedDownloadStatus?: string | undefined
  readonly trackedDownloadState?: string | undefined
  readonly statusMessages?: ReadonlyArray<string> | undefined
  readonly errorMessage?: string | undefined
  readonly quality?: string | undefined
  readonly size?: number | undefined
  readonly sizeleft?: number | undefined
  readonly timeleft?: string | undefined
  readonly estimatedCompletionTime?: string | undefined
  readonly protocol?: string | undefined
  readonly downloadClient?: string | undefined
  readonly indexer?: string | undefined
  readonly outputPath?: string | undefined
}

export interface HistoryRecord {
  readonly id?: number | undefined
  readonly date?: string | undefined
  readonly eventType: string
  readonly sourceTitle?: string | undefined
  readonly movieTitle?: string | undefined
  readonly year?: number | undefined
  readonly quality?: string | undefined
  readonly downloadClient?: string | undefined
  readonly releaseGroup?: string | undefined
  readonly size?: number | undefined
  readonly downloadId?: string | undefined
}

export interface CollectionRecord {
  readonly id: number
  readonly title: string
  readonly tmdbId: number
  readonly monitored?: boolean | undefined
  readonly searchOnAdd?: boolean | undefined
}

export interface ConfigSummary {
  readonly rootFolders: ReadonlyArray<RootFolder>
  readonly qualityProfiles: ReadonlyArray<QualityProfile>
}

export interface SearchResult {
  readonly query: string
  readonly count: number
  readonly results: ReadonlyArray<MovieLookupResult>
}

export interface ExistsResult {
  readonly tmdbId: number
  readonly exists: boolean
  readonly movie?: MovieRecord
}

export interface AddMovieOptions {
  readonly qualityProfileId?: number
  readonly searchForMovie: boolean
}

export interface AddMovieApiOptions {
  readonly qualityProfileId: number
  readonly rootFolderPath: string
  readonly searchForMovie: boolean
}

export interface AddMovieResult {
  readonly added: boolean
  readonly movie: MovieRecord
  readonly qualityProfileId: number
  readonly rootFolderPath: string
  readonly searchForMovie: boolean
}

export interface AddCollectionOptions {
  readonly searchForMovies: boolean
  readonly resultLimit: number
}

export type AddCollectionMovieAction = 'added' | 'skipped' | 'failed'

export interface AddCollectionMovieResult {
  readonly action: AddCollectionMovieAction
  readonly tmdbId: number
  readonly title: string
  readonly year?: number | undefined
  readonly movieId?: number | undefined
  readonly reason?: string | undefined
}

export interface AddCollectionResult {
  readonly collectionTmdbId: number
  readonly title: string
  readonly totalMovies: number
  readonly added: number
  readonly skipped: number
  readonly failed: number
  readonly searchForMovies: boolean
  readonly monitored: boolean
  readonly searchOnAdd: boolean
  readonly records: ReadonlyArray<AddCollectionMovieResult>
  readonly recordsTruncated: boolean
}

export interface CollectionInfoResult {
  readonly collection: CollectionRecord
}

export interface RemoveMovieOptions {
  readonly deleteFiles: boolean
}

export interface RemoveMovieResult {
  readonly removed: boolean
  readonly tmdbId: number
  readonly deleteFiles: boolean
}

export interface LimitOptions {
  readonly limit: number
}

export interface CalendarOptions {
  readonly days: number
}

export interface ListResult<Record> {
  readonly count: number
  readonly totalRecords: number
  readonly records: ReadonlyArray<Record>
}

export interface CalendarResult {
  readonly days: number
  readonly count: number
  readonly records: ReadonlyArray<MovieReleaseRecord>
}
