export type JsonObject = Readonly<Record<string, unknown>>
export type BookloreId = string | number

export interface BookloreConfigValue {
  readonly url: string
  readonly username: string
  readonly password: string
}

export interface VersionResult {
  readonly current?: string | undefined
  readonly latest?: string | undefined
}

export interface CurrentUser {
  readonly id: BookloreId
  readonly username?: string | undefined
  readonly email?: string | undefined
  readonly permissions?: JsonObject | undefined
}

export interface LibraryPath {
  readonly id?: BookloreId | undefined
  readonly path?: string | undefined
}

export interface LibraryRecord {
  readonly id: BookloreId
  readonly name?: string | undefined
  readonly paths: ReadonlyArray<LibraryPath>
}

export interface BookMetadata {
  readonly title?: string | undefined
  readonly authors?: ReadonlyArray<string> | undefined
  readonly publishedDate?: string | undefined
}

export interface BookRecord {
  readonly id: BookloreId
  readonly title?: string | undefined
  readonly authors?: ReadonlyArray<string> | undefined
  readonly libraryId?: BookloreId | undefined
  readonly metadata?: BookMetadata | undefined
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

export interface BookInfoOptions {
  readonly id: string
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
