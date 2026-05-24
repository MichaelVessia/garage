export interface AutocaliwebConfigValue {
  readonly url: string
  readonly username: string
  readonly password: string
}

export interface StatsResult {
  readonly books: number
  readonly authors: number
  readonly categories: number
  readonly series: number
}

export interface StatusResult {
  readonly title?: string | undefined
  readonly updated?: string | undefined
  readonly catalogCount: number
  readonly stats: StatsResult
}

export interface CatalogEntry {
  readonly title?: string | undefined
  readonly id?: string | undefined
  readonly href?: string | undefined
  readonly content?: string | undefined
}

export interface DownloadLink {
  readonly href: string
  readonly format?: string | undefined
  readonly mediaType?: string | undefined
  readonly size?: number | undefined
}

export interface BookRecord {
  readonly id?: string | undefined
  readonly uuid?: string | undefined
  readonly urn?: string | undefined
  readonly title?: string | undefined
  readonly authors: ReadonlyArray<string>
  readonly published?: string | undefined
  readonly updated?: string | undefined
  readonly languages: ReadonlyArray<string>
  readonly categories: ReadonlyArray<string>
  readonly summary?: string | undefined
  readonly coverHref?: string | undefined
  readonly downloads: ReadonlyArray<DownloadLink>
}

export interface BookInfoRecord extends BookRecord {
  readonly formats: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly rating?: string | undefined
  readonly lastModified?: string | undefined
  readonly authorSort?: string | undefined
  readonly titleSort?: string | undefined
}

export interface SearchResult {
  readonly query: string
  readonly total: number
  readonly count: number
  readonly records: ReadonlyArray<BookRecord>
}

export interface LimitOptions {
  readonly limit: number
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface BookInfoOptions {
  readonly uuid: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
