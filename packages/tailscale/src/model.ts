export type JsonObject = Readonly<Record<string, unknown>>

export interface ProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface LimitOptions {
  readonly limit: number
}

export interface WhoisOptions {
  readonly target: string
}

export interface PingOptions {
  readonly target: string
}

export interface ListResult<Record> {
  readonly count: number
  readonly total?: number | undefined
  readonly records: ReadonlyArray<Record>
  readonly moreAvailable?: boolean | undefined
}

export interface PeerRecord {
  readonly id?: string | undefined
  readonly hostName?: string | undefined
  readonly dnsName?: string | undefined
  readonly ips: ReadonlyArray<string>
  readonly os?: string | undefined
  readonly online?: boolean | undefined
  readonly active?: boolean | undefined
  readonly exitNode?: boolean | undefined
  readonly exitNodeOption?: boolean | undefined
  readonly relay?: string | undefined
  readonly lastSeen?: string | undefined
  readonly allowedIps?: ReadonlyArray<string> | undefined
  readonly tags?: ReadonlyArray<string> | undefined
}

export interface StatusResult {
  readonly backendState?: string | undefined
  readonly version?: string | undefined
  readonly tailnetName?: string | undefined
  readonly magicDnsSuffix?: string | undefined
  readonly magicDnsEnabled?: boolean | undefined
  readonly self?: PeerRecord | undefined
  readonly peerCount: number
  readonly onlinePeerCount: number
  readonly exitNodeCount: number
  readonly currentExitNode?: PeerRecord | undefined
  readonly health: ReadonlyArray<string>
  readonly peers: ListResult<PeerRecord>
}

export interface CurrentExitNodeResult {
  readonly usingExitNode: boolean
  readonly peer?: PeerRecord | undefined
}

export interface DnsResult {
  readonly output: string
  readonly lines: ReadonlyArray<string>
}

export interface IpResult {
  readonly ipv4?: string | undefined
  readonly ipv6?: string | undefined
}

export interface PingResult {
  readonly target: string
  readonly output: string
  readonly lines: ReadonlyArray<string>
}
