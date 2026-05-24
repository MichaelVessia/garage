export type JsonObject = Readonly<Record<string, unknown>>

export interface TubearchivistConfigValue {
  readonly url: string
  readonly username: string
  readonly password: string
}

export interface SessionCookies {
  readonly sessionId: string
  readonly csrfToken: string
}

export interface StatusResult {
  readonly url: string
  readonly health?: string | undefined
  readonly config: JsonObject
  readonly stats: {
    readonly video: JsonObject
    readonly channel: JsonObject
    readonly download: JsonObject
    readonly watch: JsonObject
  }
}

export interface ChannelRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly subscribed?: boolean | undefined
  readonly active?: boolean | undefined
  readonly lastRefresh?: string | undefined
}

export interface VideoRecord {
  readonly youtubeId: string
  readonly title?: string | undefined
  readonly channel?: string | undefined
  readonly published?: string | undefined
  readonly videoType?: string | undefined
  readonly watched?: boolean | undefined
}

export interface DownloadRecord {
  readonly youtubeId: string
  readonly title?: string | undefined
  readonly channel?: string | undefined
  readonly status?: string | undefined
  readonly videoType?: string | undefined
}

export interface PlaylistRecord {
  readonly playlistId: string
  readonly name?: string | undefined
  readonly channel?: string | undefined
  readonly subscribed?: boolean | undefined
  readonly entries?: number | undefined
}

export interface TaskRecord {
  readonly name?: string | undefined
  readonly status?: string | undefined
  readonly dateDone?: string | undefined
  readonly args?: ReadonlyArray<unknown> | undefined
  readonly kwargs?: JsonObject | undefined
  readonly taskId?: string | undefined
  readonly error?: unknown
}

export interface SearchResult {
  readonly queryType?: string | undefined
  readonly query: string
  readonly videos: ListResult<VideoRecord>
  readonly channels: ListResult<ChannelRecord>
  readonly playlists: ListResult<PlaylistRecord>
}

export interface SubscriptionResult {
  readonly target: string
  readonly subscribed: boolean
  readonly response: JsonObject
  readonly note?: string | undefined
}

export interface LimitOptions {
  readonly limit: number
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface IdOptions {
  readonly id: string
}

export interface SubscriptionOptions {
  readonly target: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly total?: number | undefined
  readonly records: ReadonlyArray<Record>
  readonly moreAvailable?: boolean | undefined
}
