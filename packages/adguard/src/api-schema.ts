import { Schema } from 'effect'

import type {
  ActiveClient,
  AutoClient,
  ClientsResult,
  DhcpStatus,
  FilterRecord,
  FiltersResult,
  JsonObject,
  ListResult,
  PersistentClient,
  ProtectionState,
  QueryLogEntry,
  Stats,
  StatsInfo,
  SystemStatus,
  TopRecord,
  VersionResult,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])
export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

export const StatusSchema = Schema.Struct({
  version: NullableString,
  running: NullableBoolean,
  protection_enabled: NullableBoolean,
  dns_addresses: NullableStringArray,
  dns_port: NullableNumber,
  http_port: NullableNumber,
  protection_disabled_duration: NullableNumber,
})

const TopListItemSchema = Schema.Record(Schema.String, Schema.Number)

export const StatsSchema = Schema.Struct({
  num_dns_queries: NullableNumber,
  num_blocked_filtering: NullableNumber,
  num_replaced_safebrowsing: NullableNumber,
  num_replaced_parental: NullableNumber,
  num_replaced_safesearch: NullableNumber,
  avg_processing_time: NullableNumber,
  time_units: NullableString,
  top_queried_domains: Schema.optional(Schema.NullOr(Schema.Array(TopListItemSchema))),
  top_blocked_domains: Schema.optional(Schema.NullOr(Schema.Array(TopListItemSchema))),
  top_clients: Schema.optional(Schema.NullOr(Schema.Array(TopListItemSchema))),
})

export const StatsInfoSchema = Schema.Struct({
  interval: NullableNumber,
})

const QuestionSchema = Schema.Struct({
  name: NullableString,
  type: NullableString,
})

const AnswerSchema = Schema.Struct({
  value: Schema.optional(Schema.NullOr(StringOrNumber)),
})

export const QueryLogEntrySchema = Schema.Struct({
  time: NullableString,
  client: NullableString,
  question: Schema.optional(Schema.NullOr(QuestionSchema)),
  status: NullableString,
  reason: NullableString,
  elapsedMs: Schema.optional(Schema.NullOr(StringOrNumber)),
  answer: Schema.optional(Schema.NullOr(Schema.Array(AnswerSchema))),
})

export const QueryLogResponseSchema = Schema.Struct({
  data: Schema.Array(QueryLogEntrySchema),
})

export const PersistentClientSchema = Schema.Struct({
  name: NullableString,
  ids: NullableStringArray,
  tags: NullableStringArray,
  upstreams: NullableStringArray,
  filtering_enabled: NullableBoolean,
  use_global_settings: NullableBoolean,
  blocked_services: NullableStringArray,
})

export const AutoClientSchema = Schema.Struct({
  name: NullableString,
  ip: NullableString,
  source: NullableString,
})

export const ClientsSchema = Schema.Struct({
  clients: Schema.optional(Schema.NullOr(Schema.Array(PersistentClientSchema))),
  auto_clients: Schema.optional(Schema.NullOr(Schema.Array(AutoClientSchema))),
})

export const ActiveClientsSchema = Schema.Array(Schema.Record(Schema.String, AutoClientSchema))

export const FilterSchema = Schema.Struct({
  id: NullableNumber,
  name: NullableString,
  enabled: NullableBoolean,
  rules_count: NullableNumber,
  last_updated: NullableString,
  url: NullableString,
})

export const FilteringStatusSchema = Schema.Struct({
  enabled: NullableBoolean,
  interval: NullableNumber,
  user_rules: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  filters: Schema.optional(Schema.NullOr(Schema.Array(FilterSchema))),
  whitelist_filters: Schema.optional(Schema.NullOr(Schema.Array(FilterSchema))),
})

export const DhcpStatusSchema = Schema.Struct({
  enabled: NullableBoolean,
  interface_name: NullableString,
  v4: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  v6: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  leases: Schema.optional(Schema.NullOr(Schema.Array(JsonObjectSchema))),
  static_leases: Schema.optional(Schema.NullOr(Schema.Array(JsonObjectSchema))),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

export const toSystemStatus = (status: typeof StatusSchema.Type): SystemStatus => ({
  version: fromNullable(status.version),
  running: fromNullable(status.running),
  protectionEnabled: fromNullable(status.protection_enabled),
  dnsAddresses: fromNullable(status.dns_addresses),
  dnsPort: fromNullable(status.dns_port),
  httpPort: fromNullable(status.http_port),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

export const toVersionResult = (status: typeof StatusSchema.Type): VersionResult => ({
  version: fromNullable(status.version),
})

const toTopRecords = (
  records: ReadonlyArray<typeof TopListItemSchema.Type> | null | undefined
): ReadonlyArray<TopRecord> =>
  (records ?? []).flatMap((record) => Object.entries(record).map(([name, count]) => ({ name, count }))).slice(0, 10)

export const toStats = (stats: typeof StatsSchema.Type): Stats => ({
  numDnsQueries: fromNullable(stats.num_dns_queries),
  numBlockedFiltering: fromNullable(stats.num_blocked_filtering),
  numReplacedSafebrowsing: fromNullable(stats.num_replaced_safebrowsing),
  numReplacedParental: fromNullable(stats.num_replaced_parental),
  numReplacedSafesearch: fromNullable(stats.num_replaced_safesearch),
  avgProcessingTime: fromNullable(stats.avg_processing_time),
  timeUnits: fromNullable(stats.time_units),
  topQueriedDomains: toTopRecords(stats.top_queried_domains),
  topBlockedDomains: toTopRecords(stats.top_blocked_domains),
  topClients: toTopRecords(stats.top_clients),
})

export const toStatsInfo = (statsInfo: typeof StatsInfoSchema.Type): StatsInfo => ({
  interval: fromNullable(statsInfo.interval),
})

export const toQueryLogEntry = (entry: typeof QueryLogEntrySchema.Type): QueryLogEntry => ({
  time: fromNullable(entry.time),
  client: fromNullable(entry.client),
  question: fromNullable(entry.question?.name),
  type: fromNullable(entry.question?.type),
  status: fromNullable(entry.status),
  reason: fromNullable(entry.reason),
  elapsedMs: entry.elapsedMs === null || entry.elapsedMs === undefined ? undefined : String(entry.elapsedMs),
  answer: (entry.answer ?? [])
    .flatMap((answer) => (answer.value === null || answer.value === undefined ? [] : [String(answer.value)]))
    .join(', '),
})

export const toPersistentClient = (client: typeof PersistentClientSchema.Type): PersistentClient => ({
  name: fromNullable(client.name),
  ids: fromNullable(client.ids),
  tags: fromNullable(client.tags),
  upstreams: fromNullable(client.upstreams),
  filteringEnabled: fromNullable(client.filtering_enabled),
  useGlobalSettings: fromNullable(client.use_global_settings),
  blockedServices: fromNullable(client.blocked_services),
})

export const toAutoClient = (client: typeof AutoClientSchema.Type): AutoClient => ({
  name: fromNullable(client.name),
  ip: fromNullable(client.ip),
  source: fromNullable(client.source),
})

export const toClientsResult = (clients: typeof ClientsSchema.Type): ClientsResult => {
  const autoClients = clients.auto_clients ?? []
  return {
    configured: (clients.clients ?? []).map(toPersistentClient),
    autoCount: autoClients.length,
    autoSample: autoClients.slice(0, 10).map(toAutoClient),
  }
}

export const toActiveClients = (clients: typeof ActiveClientsSchema.Type): ReadonlyArray<ActiveClient> =>
  clients.flatMap((entry) =>
    Object.entries(entry).map(([ip, client]) => {
      const clientIp = fromNullable(client.ip)
      return {
        ip,
        name: fromNullable(client.name),
        ids: clientIp === undefined ? undefined : [clientIp],
        tags: undefined,
        upstreams: undefined,
        source: fromNullable(client.source),
      }
    })
  )

export const toFilterRecord = (filter: typeof FilterSchema.Type): FilterRecord => ({
  id: fromNullable(filter.id),
  name: fromNullable(filter.name),
  enabled: fromNullable(filter.enabled),
  rulesCount: fromNullable(filter.rules_count),
  lastUpdated: fromNullable(filter.last_updated),
  url: fromNullable(filter.url),
})

export const toFiltersResult = (status: typeof FilteringStatusSchema.Type): FiltersResult => ({
  enabled: fromNullable(status.enabled),
  intervalHours: fromNullable(status.interval),
  userRulesCount: (status.user_rules ?? []).length,
  blocklists: (status.filters ?? []).map(toFilterRecord),
  allowlists: (status.whitelist_filters ?? []).map(toFilterRecord),
})

const jsonObject = (value: typeof JsonObjectSchema.Type | null | undefined): JsonObject | undefined =>
  value === null ? undefined : value

const jsonObjects = (
  value: ReadonlyArray<typeof JsonObjectSchema.Type> | null | undefined
): ReadonlyArray<JsonObject> => value ?? []

export const toDhcpStatus = (status: typeof DhcpStatusSchema.Type): DhcpStatus => {
  const leases = jsonObjects(status.leases)
  const staticLeases = jsonObjects(status.static_leases)
  return {
    enabled: fromNullable(status.enabled),
    interfaceName: fromNullable(status.interface_name),
    v4: jsonObject(status.v4),
    v6: jsonObject(status.v6),
    leaseCount: leases.length,
    staticLeaseCount: staticLeases.length,
    leases,
    staticLeases,
  }
}

export const toProtectionState = (status: typeof StatusSchema.Type): ProtectionState => ({
  protectionEnabled: fromNullable(status.protection_enabled),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

export const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})
