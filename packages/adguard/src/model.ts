export interface AdguardConfigValue {
  readonly url: string
  readonly username: string
  readonly password: string
}

export interface SystemStatus {
  readonly version?: string | undefined
  readonly running?: boolean | undefined
  readonly protectionEnabled?: boolean | undefined
  readonly dnsAddresses?: ReadonlyArray<string> | undefined
  readonly dnsPort?: number | undefined
  readonly httpPort?: number | undefined
  readonly protectionDisabledDuration?: number | undefined
}

export interface VersionResult {
  readonly version?: string | undefined
}

export interface TopRecord {
  readonly name: string
  readonly count: number
}

export interface Stats {
  readonly numDnsQueries?: number | undefined
  readonly numBlockedFiltering?: number | undefined
  readonly numReplacedSafebrowsing?: number | undefined
  readonly numReplacedParental?: number | undefined
  readonly numReplacedSafesearch?: number | undefined
  readonly avgProcessingTime?: number | undefined
  readonly timeUnits?: string | undefined
  readonly topQueriedDomains: ReadonlyArray<TopRecord>
  readonly topBlockedDomains: ReadonlyArray<TopRecord>
  readonly topClients: ReadonlyArray<TopRecord>
}

export interface StatsInfo {
  readonly interval?: number | undefined
}

export interface QueryLogEntry {
  readonly time?: string | undefined
  readonly client?: string | undefined
  readonly question?: string | undefined
  readonly type?: string | undefined
  readonly status?: string | undefined
  readonly reason?: string | undefined
  readonly elapsedMs?: string | undefined
  readonly answer: string
}

export interface PersistentClient {
  readonly name?: string | undefined
  readonly ids?: ReadonlyArray<string> | undefined
  readonly tags?: ReadonlyArray<string> | undefined
  readonly upstreams?: ReadonlyArray<string> | undefined
  readonly filteringEnabled?: boolean | undefined
  readonly useGlobalSettings?: boolean | undefined
  readonly blockedServices?: ReadonlyArray<string> | undefined
}

export interface AutoClient {
  readonly name?: string | undefined
  readonly ip?: string | undefined
  readonly source?: string | undefined
}

export interface ClientsResult {
  readonly configured: ReadonlyArray<PersistentClient>
  readonly autoCount: number
  readonly autoSample: ReadonlyArray<AutoClient>
}

export interface ActiveClient {
  readonly ip: string
  readonly name?: string | undefined
  readonly ids?: ReadonlyArray<string> | undefined
  readonly tags?: ReadonlyArray<string> | undefined
  readonly upstreams?: ReadonlyArray<string> | undefined
  readonly source?: string | undefined
}

export interface FilterRecord {
  readonly id?: number | undefined
  readonly name?: string | undefined
  readonly enabled?: boolean | undefined
  readonly rulesCount?: number | undefined
  readonly lastUpdated?: string | undefined
  readonly url?: string | undefined
}

export interface FiltersResult {
  readonly enabled?: boolean | undefined
  readonly intervalHours?: number | undefined
  readonly userRulesCount: number
  readonly blocklists: ReadonlyArray<FilterRecord>
  readonly allowlists: ReadonlyArray<FilterRecord>
}

export type JsonObject = Readonly<Record<string, unknown>>

export interface DhcpStatus {
  readonly enabled?: boolean | undefined
  readonly interfaceName?: string | undefined
  readonly v4?: JsonObject | undefined
  readonly v6?: JsonObject | undefined
  readonly leaseCount: number
  readonly staticLeaseCount: number
  readonly leases: ReadonlyArray<JsonObject>
  readonly staticLeases: ReadonlyArray<JsonObject>
}

export interface ProtectionState {
  readonly protectionEnabled?: boolean | undefined
  readonly protectionDisabledDuration?: number | undefined
}

export type ProtectionToggleState = 'on' | 'off'

export interface LimitOptions {
  readonly limit: number
}

export interface SearchOptions extends LimitOptions {
  readonly query: string
}

export interface ClientLookupOptions {
  readonly ip: string
}

export interface ProtectionToggleOptions {
  readonly state: ProtectionToggleState
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
