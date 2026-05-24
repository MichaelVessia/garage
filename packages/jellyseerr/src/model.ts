export interface JellyseerrConfigValue {
  readonly url: string
  readonly apiKey: string
}

export interface SystemStatus {
  readonly version?: string | undefined
  readonly commitTag?: string | undefined
  readonly updateAvailable?: boolean | undefined
  readonly commitsBehind?: number | undefined
  readonly restartRequired?: boolean | undefined
}

export type RequestFilter = 'pending' | 'all'
export type StatusValue = number | string

export interface LimitOptions {
  readonly limit: number
}

export interface RequestListOptions extends LimitOptions {
  readonly filter: RequestFilter
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly totalRecords: number
  readonly records: ReadonlyArray<Record>
}

export interface MediaSummary {
  readonly id: number
  readonly tmdbId?: number | undefined
  readonly mediaType?: string | undefined
  readonly status?: StatusValue | undefined
  readonly title?: string | undefined
  readonly mediaAdded?: string | undefined
}

export interface RequestRecord {
  readonly id: number
  readonly status?: StatusValue | undefined
  readonly type?: string | undefined
  readonly createdAt?: string | undefined
  readonly updatedAt?: string | undefined
  readonly requestedBy?: string | undefined
  readonly media: MediaSummary
}

export type RequestCounts = Readonly<Record<string, number>>

export interface SearchRecord {
  readonly id: number
  readonly mediaType?: string | undefined
  readonly title?: string | undefined
  readonly releaseDate?: string | undefined
  readonly firstAirDate?: string | undefined
  readonly overview?: string | undefined
}

export interface UserRecord {
  readonly id: number
  readonly email?: string | undefined
  readonly displayName?: string | undefined
  readonly username?: string | undefined
  readonly userType?: number | undefined
  readonly permissions?: number | undefined
}

export interface IssueRecord {
  readonly id: number
  readonly issueType?: string | undefined
  readonly status?: StatusValue | undefined
  readonly createdAt?: string | undefined
  readonly createdBy?: string | undefined
  readonly media: MediaSummary
}

export interface DeleteRequestResult {
  readonly deleted: boolean
  readonly requestId: number
  readonly httpStatus: number
}
