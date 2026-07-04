import { JsonObject as BaseJsonObject, ListResultSchema } from '@garage/cli-protocol'
import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const AdguardConfigValue = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type AdguardConfigValue = typeof AdguardConfigValue.Type

export const SystemStatus = Schema.Struct({
  version: OptionalString,
  running: OptionalBoolean,
  protectionEnabled: OptionalBoolean,
  dnsAddresses: OptionalStringArray,
  dnsPort: OptionalNumber,
  httpPort: OptionalNumber,
  protectionDisabledDuration: OptionalNumber,
})
export type SystemStatus = typeof SystemStatus.Type

export const VersionResult = Schema.Struct({ version: OptionalString })
export type VersionResult = typeof VersionResult.Type

export const TopRecord = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
})
export type TopRecord = typeof TopRecord.Type

export const Stats = Schema.Struct({
  numDnsQueries: OptionalNumber,
  numBlockedFiltering: OptionalNumber,
  numReplacedSafebrowsing: OptionalNumber,
  numReplacedParental: OptionalNumber,
  numReplacedSafesearch: OptionalNumber,
  avgProcessingTime: OptionalNumber,
  timeUnits: OptionalString,
  topQueriedDomains: Schema.Array(TopRecord),
  topBlockedDomains: Schema.Array(TopRecord),
  topClients: Schema.Array(TopRecord),
})
export type Stats = typeof Stats.Type

export const StatsInfo = Schema.Struct({ interval: OptionalNumber })
export type StatsInfo = typeof StatsInfo.Type

export const QueryLogEntry = Schema.Struct({
  time: OptionalString,
  client: OptionalString,
  question: OptionalString,
  type: OptionalString,
  status: OptionalString,
  reason: OptionalString,
  elapsedMs: OptionalString,
  answer: Schema.String,
})
export type QueryLogEntry = typeof QueryLogEntry.Type

export const PersistentClient = Schema.Struct({
  name: OptionalString,
  ids: OptionalStringArray,
  tags: OptionalStringArray,
  upstreams: OptionalStringArray,
  filteringEnabled: OptionalBoolean,
  useGlobalSettings: OptionalBoolean,
  blockedServices: OptionalStringArray,
})
export type PersistentClient = typeof PersistentClient.Type

export const AutoClient = Schema.Struct({
  name: OptionalString,
  ip: OptionalString,
  source: OptionalString,
})
export type AutoClient = typeof AutoClient.Type

export const ClientsResult = Schema.Struct({
  configured: Schema.Array(PersistentClient),
  autoCount: Schema.Number,
  autoSample: Schema.Array(AutoClient),
})
export type ClientsResult = typeof ClientsResult.Type

export const ActiveClient = Schema.Struct({
  ip: Schema.String,
  name: OptionalString,
  ids: OptionalStringArray,
  tags: OptionalStringArray,
  upstreams: OptionalStringArray,
  source: OptionalString,
})
export type ActiveClient = typeof ActiveClient.Type

export const FilterRecord = Schema.Struct({
  id: OptionalNumber,
  name: OptionalString,
  enabled: OptionalBoolean,
  rulesCount: OptionalNumber,
  lastUpdated: OptionalString,
  url: OptionalString,
})
export type FilterRecord = typeof FilterRecord.Type

export const FiltersResult = Schema.Struct({
  enabled: OptionalBoolean,
  intervalHours: OptionalNumber,
  userRulesCount: Schema.Number,
  blocklists: Schema.Array(FilterRecord),
  allowlists: Schema.Array(FilterRecord),
})
export type FiltersResult = typeof FiltersResult.Type

export const JsonObject = BaseJsonObject
export type JsonObject = typeof JsonObject.Type

export const DhcpStatus = Schema.Struct({
  enabled: OptionalBoolean,
  interfaceName: OptionalString,
  v4: Schema.optional(JsonObject),
  v6: Schema.optional(JsonObject),
  leaseCount: Schema.Number,
  staticLeaseCount: Schema.Number,
  leases: Schema.Array(JsonObject),
  staticLeases: Schema.Array(JsonObject),
})
export type DhcpStatus = typeof DhcpStatus.Type

export const ProtectionState = Schema.Struct({
  protectionEnabled: OptionalBoolean,
  protectionDisabledDuration: OptionalNumber,
})
export type ProtectionState = typeof ProtectionState.Type

export const ProtectionToggleState = Schema.Literals(['on', 'off'])
export type ProtectionToggleState = typeof ProtectionToggleState.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const ClientLookupOptions = Schema.Struct({ ip: Schema.String })
export type ClientLookupOptions = typeof ClientLookupOptions.Type

export const ProtectionToggleOptions = Schema.Struct({ state: ProtectionToggleState })
export type ProtectionToggleOptions = typeof ProtectionToggleOptions.Type

export const ListResult = ListResultSchema
export type ListResult<Record> = ListResultSchema<Record>
