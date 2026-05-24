export interface JellyfinConfigValue {
  readonly url: string
  readonly apiKey: string
}

export interface SystemStatus {
  readonly serverName?: string | undefined
  readonly version?: string | undefined
  readonly id?: string | undefined
  readonly operatingSystem?: string | undefined
  readonly productName?: string | undefined
  readonly localAddress?: string | undefined
}

export interface UserRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly lastActivityDate?: string | undefined
  readonly isAdministrator?: boolean | undefined
  readonly isDisabled?: boolean | undefined
}

export interface LibraryRecord {
  readonly name?: string | undefined
  readonly collectionType?: string | undefined
  readonly itemId?: string | undefined
  readonly locations?: ReadonlyArray<string> | undefined
}

export interface SessionRecord {
  readonly sessionId?: string | undefined
  readonly user?: string | undefined
  readonly client?: string | undefined
  readonly device?: string | undefined
  readonly appVersion?: string | undefined
  readonly lastActivityDate?: string | undefined
  readonly nowPlaying?: string | undefined
  readonly playMethod?: string | undefined
}

export interface NowPlayingRecord {
  readonly user?: string | undefined
  readonly device?: string | undefined
  readonly client?: string | undefined
  readonly item: string
  readonly type?: string | undefined
  readonly series?: string | undefined
  readonly season?: number | undefined
  readonly episode?: number | undefined
  readonly positionTicks?: number | undefined
  readonly runtimeTicks?: number | undefined
  readonly isPaused?: boolean | undefined
  readonly playMethod?: string | undefined
}

export interface ItemRecord {
  readonly id: string
  readonly name: string
  readonly type?: string | undefined
  readonly series?: string | undefined
  readonly season?: number | undefined
  readonly episode?: number | undefined
  readonly dateCreated?: string | undefined
  readonly productionYear?: number | undefined
}

export type LibraryStats = Readonly<Record<string, number>>

export interface ScheduledTaskRecord {
  readonly id: string
  readonly name?: string | undefined
  readonly state?: string | undefined
  readonly lastExecutionResult?: string | undefined
  readonly lastEndTime?: string | undefined
  readonly category?: string | undefined
}

export interface RunTaskResult {
  readonly started: boolean
  readonly taskId: string
  readonly httpStatus: number
}

export interface LimitOptions {
  readonly limit: number
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
