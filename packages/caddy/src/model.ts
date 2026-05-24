export interface CaddyConfigValue {
  readonly url: string
}

export type JsonObject = Readonly<Record<string, unknown>>

export interface RouteSummary {
  readonly server: string
  readonly listen?: ReadonlyArray<string> | undefined
  readonly routes: ReadonlyArray<RouteRecord>
}

export interface RouteRecord {
  readonly match?: ReadonlyArray<JsonObject> | undefined
  readonly upstreams: ReadonlyArray<string>
}

export interface UpstreamRecord {
  readonly address?: string | undefined
  readonly numRequests?: number | undefined
  readonly fails?: number | undefined
  readonly healthy?: boolean | undefined
}

export interface PkiCa {
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly rootCommonName?: string | undefined
  readonly intermediateCommonName?: string | undefined
  readonly rootCertificate?: string | undefined
  readonly intermediateCertificate?: string | undefined
}

export interface ReloadResult {
  readonly reloaded: boolean
  readonly httpStatus: number
}

export interface ListResult<Record> {
  readonly count: number
  readonly records: ReadonlyArray<Record>
}
