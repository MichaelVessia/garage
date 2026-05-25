import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const AdguardConfigValueSchema = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type AdguardConfigValue = typeof AdguardConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  version: OptionalString,
  running: OptionalBoolean,
  protectionEnabled: OptionalBoolean,
  dnsAddresses: OptionalStringArray,
  dnsPort: OptionalNumber,
  httpPort: OptionalNumber,
  protectionDisabledDuration: OptionalNumber,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const VersionResultSchema = Schema.Struct({ version: OptionalString })
export type VersionResult = typeof VersionResultSchema.Type

export const TopRecordSchema = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
})
export type TopRecord = typeof TopRecordSchema.Type

export const StatsSchema = Schema.Struct({
  numDnsQueries: OptionalNumber,
  numBlockedFiltering: OptionalNumber,
  numReplacedSafebrowsing: OptionalNumber,
  numReplacedParental: OptionalNumber,
  numReplacedSafesearch: OptionalNumber,
  avgProcessingTime: OptionalNumber,
  timeUnits: OptionalString,
  topQueriedDomains: Schema.Array(TopRecordSchema),
  topBlockedDomains: Schema.Array(TopRecordSchema),
  topClients: Schema.Array(TopRecordSchema),
})
export type Stats = typeof StatsSchema.Type

export const StatsInfoSchema = Schema.Struct({ interval: OptionalNumber })
export type StatsInfo = typeof StatsInfoSchema.Type

export const QueryLogEntrySchema = Schema.Struct({
  time: OptionalString,
  client: OptionalString,
  question: OptionalString,
  type: OptionalString,
  status: OptionalString,
  reason: OptionalString,
  elapsedMs: OptionalString,
  answer: Schema.String,
})
export type QueryLogEntry = typeof QueryLogEntrySchema.Type

export const PersistentClientSchema = Schema.Struct({
  name: OptionalString,
  ids: OptionalStringArray,
  tags: OptionalStringArray,
  upstreams: OptionalStringArray,
  filteringEnabled: OptionalBoolean,
  useGlobalSettings: OptionalBoolean,
  blockedServices: OptionalStringArray,
})
export type PersistentClient = typeof PersistentClientSchema.Type

export const AutoClientSchema = Schema.Struct({
  name: OptionalString,
  ip: OptionalString,
  source: OptionalString,
})
export type AutoClient = typeof AutoClientSchema.Type

export const ClientsResultSchema = Schema.Struct({
  configured: Schema.Array(PersistentClientSchema),
  autoCount: Schema.Number,
  autoSample: Schema.Array(AutoClientSchema),
})
export type ClientsResult = typeof ClientsResultSchema.Type

export const ActiveClientSchema = Schema.Struct({
  ip: Schema.String,
  name: OptionalString,
  ids: OptionalStringArray,
  tags: OptionalStringArray,
  upstreams: OptionalStringArray,
  source: OptionalString,
})
export type ActiveClient = typeof ActiveClientSchema.Type

export const FilterRecordSchema = Schema.Struct({
  id: OptionalNumber,
  name: OptionalString,
  enabled: OptionalBoolean,
  rulesCount: OptionalNumber,
  lastUpdated: OptionalString,
  url: OptionalString,
})
export type FilterRecord = typeof FilterRecordSchema.Type

export const FiltersResultSchema = Schema.Struct({
  enabled: OptionalBoolean,
  intervalHours: OptionalNumber,
  userRulesCount: Schema.Number,
  blocklists: Schema.Array(FilterRecordSchema),
  allowlists: Schema.Array(FilterRecordSchema),
})
export type FiltersResult = typeof FiltersResultSchema.Type

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObjectSchema.Type

export const DhcpStatusSchema = Schema.Struct({
  enabled: OptionalBoolean,
  interfaceName: OptionalString,
  v4: Schema.optional(JsonObjectSchema),
  v6: Schema.optional(JsonObjectSchema),
  leaseCount: Schema.Number,
  staticLeaseCount: Schema.Number,
  leases: Schema.Array(JsonObjectSchema),
  staticLeases: Schema.Array(JsonObjectSchema),
})
export type DhcpStatus = typeof DhcpStatusSchema.Type

export const ProtectionStateSchema = Schema.Struct({
  protectionEnabled: OptionalBoolean,
  protectionDisabledDuration: OptionalNumber,
})
export type ProtectionState = typeof ProtectionStateSchema.Type

export const ProtectionToggleStateSchema = Schema.Literals(['on', 'off'])
export type ProtectionToggleState = typeof ProtectionToggleStateSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const ClientLookupOptionsSchema = Schema.Struct({ ip: Schema.String })
export type ClientLookupOptions = typeof ClientLookupOptionsSchema.Type

export const ProtectionToggleOptionsSchema = Schema.Struct({ state: ProtectionToggleStateSchema })
export type ProtectionToggleOptions = typeof ProtectionToggleOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>
