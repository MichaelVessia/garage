export interface SonarrConfigValue {
  readonly url: string
  readonly apiKey: string
  readonly defaultQualityProfileId: number
}

export interface SystemStatus {
  readonly appName: string
  readonly version: string
  readonly instanceName?: string | undefined
  readonly runtimeVersion?: string | undefined
  readonly databaseVersion?: string | undefined
  readonly startupPath?: string | undefined
  readonly appData?: string | undefined
  readonly mode?: string | undefined
  readonly authentication?: string | undefined
  readonly startTime?: string | undefined
  readonly urlBase?: string | undefined
  readonly isDocker?: boolean | undefined
  readonly branch?: string | undefined
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

export interface SeriesLookupResult {
  readonly title: string
  readonly year?: number | undefined
  readonly tvdbId: number
  readonly tvdbUrl: string
  readonly titleSlug?: string | undefined
  readonly imdbId?: string | undefined
  readonly tmdbId?: number | undefined
  readonly status?: string | undefined
  readonly network?: string | undefined
  readonly genres?: ReadonlyArray<string> | undefined
  readonly runtime?: number | undefined
  readonly firstAired?: string | undefined
  readonly remotePoster?: string | undefined
  readonly overview?: string | undefined
}

export interface SeriesStatistics {
  readonly seasonCount?: number | undefined
  readonly episodeFileCount?: number | undefined
  readonly episodeCount?: number | undefined
  readonly totalEpisodeCount?: number | undefined
  readonly sizeOnDisk?: number | undefined
  readonly percentOfEpisodes?: number | undefined
}

export interface SeriesRecord {
  readonly id: number
  readonly title: string
  readonly tvdbId: number
  readonly year?: number | undefined
  readonly path?: string | undefined
  readonly monitored?: boolean | undefined
  readonly status?: string | undefined
  readonly qualityProfileId?: number | undefined
  readonly qualityProfileName?: string | undefined
  readonly network?: string | undefined
  readonly seasonFolder?: boolean | undefined
  readonly seriesType?: string | undefined
  readonly statistics?: SeriesStatistics | undefined
}

export interface QueueRecord {
  readonly id?: number | undefined
  readonly title: string
  readonly seriesTitle: string
  readonly seasonNumber?: number | undefined
  readonly episodeNumber?: number | undefined
  readonly episodeTitle?: string | undefined
  readonly status: string
  readonly trackedDownloadStatus?: string | undefined
  readonly trackedDownloadState?: string | undefined
  readonly statusMessages?: ReadonlyArray<string> | undefined
  readonly errorMessage?: string | undefined
  readonly quality?: string | undefined
  readonly languages?: ReadonlyArray<string> | undefined
  readonly size?: number | undefined
  readonly sizeleft?: number | undefined
  readonly timeleft?: string | undefined
  readonly estimatedCompletionTime?: string | undefined
  readonly protocol?: string | undefined
  readonly downloadClient?: string | undefined
  readonly indexer?: string | undefined
  readonly outputPath?: string | undefined
}

export interface EpisodeRecord {
  readonly id?: number | undefined
  readonly title: string
  readonly seriesTitle: string
  readonly seasonNumber?: number | undefined
  readonly episodeNumber?: number | undefined
  readonly airDateUtc?: string | undefined
  readonly hasFile?: boolean | undefined
  readonly monitored?: boolean | undefined
  readonly seriesStatus?: string | undefined
  readonly network?: string | undefined
  readonly lastSearchTime?: string | undefined
  readonly overview?: string | undefined
}

export interface HistoryRecord {
  readonly id?: number | undefined
  readonly date?: string | undefined
  readonly eventType: string
  readonly sourceTitle?: string | undefined
  readonly seriesTitle: string
  readonly seasonNumber?: number | undefined
  readonly episodeNumber?: number | undefined
  readonly episodeTitle?: string | undefined
  readonly quality?: string | undefined
  readonly languages?: ReadonlyArray<string> | undefined
  readonly downloadClient?: string | undefined
  readonly releaseGroup?: string | undefined
  readonly size?: number | undefined
  readonly downloadId?: string | undefined
}

export interface ConfigSummary {
  readonly rootFolders: ReadonlyArray<RootFolder>
  readonly qualityProfiles: ReadonlyArray<QualityProfile>
}

export interface SearchResult {
  readonly query: string
  readonly count: number
  readonly results: ReadonlyArray<SeriesLookupResult>
}

export interface ExistsResult {
  readonly tvdbId: number
  readonly exists: boolean
  readonly series?: SeriesRecord
}

export interface AddSeriesOptions {
  readonly qualityProfileId?: number
  readonly searchForMissingEpisodes: boolean
}

export interface AddSeriesApiOptions {
  readonly qualityProfileId: number
  readonly rootFolderPath: string
  readonly searchForMissingEpisodes: boolean
}

export interface AddSeriesResult {
  readonly added: boolean
  readonly series: SeriesRecord
  readonly qualityProfileId: number
  readonly rootFolderPath: string
  readonly searchForMissingEpisodes: boolean
}

export interface RemoveSeriesOptions {
  readonly deleteFiles: boolean
}

export interface RemoveSeriesResult {
  readonly removed: boolean
  readonly tvdbId: number
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
  readonly records: ReadonlyArray<EpisodeRecord>
}
