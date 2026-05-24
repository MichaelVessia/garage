export interface SonarrConfigValue {
  readonly url: string
  readonly apiKey: string
  readonly defaultQualityProfileId: number
}

export interface SystemStatus {
  readonly appName: string
  readonly version: string
}

export interface RootFolder {
  readonly id: number
  readonly path: string
  readonly freeSpace?: number | undefined
}

export interface QualityProfile {
  readonly id: number
  readonly name: string
}

export interface SeriesLookupResult {
  readonly title: string
  readonly year?: number | undefined
  readonly tvdbId: number
  readonly tvdbUrl: string
  readonly titleSlug?: string | undefined
}

export interface SeriesRecord {
  readonly id: number
  readonly title: string
  readonly tvdbId: number
  readonly year?: number | undefined
}

export interface QueueRecord {
  readonly title: string
  readonly seriesTitle: string
  readonly status: string
}

export interface EpisodeRecord {
  readonly title: string
  readonly seriesTitle: string
  readonly airDateUtc?: string | undefined
}

export interface HistoryRecord {
  readonly title: string
  readonly seriesTitle: string
  readonly eventType: string
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
  readonly records: ReadonlyArray<Record>
}

export interface CalendarResult {
  readonly days: number
  readonly count: number
  readonly records: ReadonlyArray<EpisodeRecord>
}
