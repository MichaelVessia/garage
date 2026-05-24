export interface ProwlarrConfigValue {
  readonly url: string
  readonly apiKey: string
}

export interface SystemStatus {
  readonly appName?: string | undefined
  readonly version: string
  readonly instanceName?: string | undefined
  readonly branch?: string | undefined
  readonly runtimeVersion?: string | undefined
  readonly osName?: string | undefined
  readonly osVersion?: string | undefined
  readonly buildTime?: string | undefined
  readonly isLinux?: boolean | undefined
  readonly isProduction?: boolean | undefined
}

export interface HealthRecord {
  readonly source?: string | undefined
  readonly type?: string | undefined
  readonly message: string
  readonly wikiUrl?: string | undefined
}

export interface IndexerRecord {
  readonly id: number
  readonly name: string
  readonly protocol?: string | undefined
  readonly enabled?: boolean | undefined
  readonly priority?: number | undefined
  readonly supportsSearch?: boolean | undefined
  readonly supportsRss?: boolean | undefined
  readonly implementation?: string | undefined
  readonly implementationName?: string | undefined
}

export interface IndexerStatsRecord {
  readonly id: number
  readonly name: string
  readonly queries?: number | undefined
  readonly grabs?: number | undefined
  readonly failedQueries?: number | undefined
  readonly failedGrabs?: number | undefined
  readonly avgResponseTimeMs?: number | undefined
}

export type SearchProtocol = 'torrent' | 'usenet'

export interface SearchOptions {
  readonly limit: number
  readonly protocol?: SearchProtocol | undefined
  readonly category?: number | undefined
  readonly type?: string | undefined
}

export interface TvSearchOptions {
  readonly tvdbId: number
  readonly season?: number | undefined
  readonly episode?: number | undefined
  readonly limit: number
}

export interface MovieSearchOptions {
  readonly imdbId?: string | undefined
  readonly tmdbId?: number | undefined
  readonly limit: number
}

export interface ReleaseRecord {
  readonly guid?: string | undefined
  readonly indexerId?: number | undefined
  readonly indexer?: string | undefined
  readonly title: string
  readonly protocol?: string | undefined
  readonly size?: number | undefined
  readonly sizeMB?: number | undefined
  readonly seeders?: number | undefined
  readonly leechers?: number | undefined
  readonly grabs?: number | undefined
  readonly age?: number | undefined
  readonly publishDate?: string | undefined
  readonly downloadUrl?: string | undefined
  readonly infoUrl?: string | undefined
  readonly categories?: ReadonlyArray<string | number> | undefined
}

export interface ApplicationRecord {
  readonly id: number
  readonly name: string
  readonly implementation?: string | undefined
  readonly syncLevel?: string | undefined
  readonly tags?: ReadonlyArray<number> | undefined
}

export interface CommandResult {
  readonly id?: number | undefined
  readonly name: string
  readonly status?: string | undefined
  readonly queued?: string | undefined
  readonly started?: string | undefined
  readonly ended?: string | undefined
}

export interface IndexerTestResult {
  readonly indexerId: number
  readonly passed: boolean
  readonly httpStatus: number
}

export interface HistoryRecord {
  readonly id?: number | undefined
  readonly date?: string | undefined
  readonly eventType: string
  readonly indexerId?: number | undefined
  readonly successful?: boolean | undefined
  readonly query?: string | undefined
  readonly queryType?: string | undefined
  readonly results?: number | undefined
  readonly elapsedTime?: number | string | undefined
}

export interface LimitOptions {
  readonly limit: number
}

export interface ListResult<Record> {
  readonly count: number
  readonly totalRecords: number
  readonly records: ReadonlyArray<Record>
}

export interface SearchResult {
  readonly query: string
  readonly type: string
  readonly count: number
  readonly totalRecords: number
  readonly records: ReadonlyArray<ReleaseRecord>
}
