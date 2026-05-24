export interface SabnzbdConfigValue {
  readonly url: string
  readonly apiKey: string
}

export interface SystemStatus {
  readonly version?: string | undefined
  readonly uptime?: string | undefined
  readonly paused?: boolean | undefined
  readonly pausedAll?: boolean | undefined
  readonly speedlimit?: string | undefined
  readonly speedlimitAbs?: string | undefined
  readonly diskspace1Norm?: string | undefined
  readonly diskspace2Norm?: string | undefined
  readonly haveWarnings?: boolean | undefined
  readonly warnings?: ReadonlyArray<string> | undefined
  readonly newRelease?: string | undefined
}

export interface VersionResult {
  readonly version: string
}

export interface QueueSlot {
  readonly nzoId: string
  readonly filename: string
  readonly status?: string | undefined
  readonly priority?: string | undefined
  readonly category?: string | undefined
  readonly mb?: string | undefined
  readonly mbleft?: string | undefined
  readonly percentage?: string | undefined
  readonly timeleft?: string | undefined
}

export interface QueueResult {
  readonly status?: string | undefined
  readonly paused?: boolean | undefined
  readonly speed?: string | undefined
  readonly speedlimit?: string | undefined
  readonly timeleft?: string | undefined
  readonly mb?: string | undefined
  readonly mbleft?: string | undefined
  readonly noofslots?: number | undefined
  readonly count: number
  readonly totalRecords: number
  readonly slots: ReadonlyArray<QueueSlot>
}

export interface HistorySlot {
  readonly nzoId: string
  readonly name: string
  readonly status?: string | undefined
  readonly category?: string | undefined
  readonly bytes?: number | undefined
  readonly failMessage?: string | undefined
  readonly storage?: string | undefined
  readonly completed?: number | undefined
}

export interface HistoryResult {
  readonly totalSize?: string | undefined
  readonly monthSize?: string | undefined
  readonly weekSize?: string | undefined
  readonly daySize?: string | undefined
  readonly noofslots?: number | undefined
  readonly count: number
  readonly totalRecords: number
  readonly slots: ReadonlyArray<HistorySlot>
}

export type SabnzbdAction = 'pause' | 'resume' | 'delete'

export interface ActionResult {
  readonly action: SabnzbdAction
  readonly ok: boolean
  readonly nzoId?: string | undefined
  readonly deleteFiles?: boolean | undefined
}

export interface ServerUsage {
  readonly total?: number | undefined
  readonly month?: number | undefined
  readonly week?: number | undefined
  readonly day?: number | undefined
}

export interface ServerStats extends ServerUsage {
  readonly servers: Readonly<Record<string, ServerUsage>>
}

export interface LimitOptions {
  readonly limit: number
}

export interface DeleteOptions {
  readonly deleteFiles: boolean
}
