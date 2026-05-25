import { Schema, SchemaGetter } from 'effect'

import {
  ActiveClientSchema as DomainActiveClientSchema,
  ClientsResultSchema as DomainClientsResultSchema,
  DhcpStatusSchema as DomainDhcpStatusSchema,
  FiltersResultSchema as DomainFiltersResultSchema,
  ListResultSchema as DomainListResultSchema,
  ProtectionStateSchema as DomainProtectionStateSchema,
  QueryLogEntrySchema as DomainQueryLogEntrySchema,
  StatsInfoSchema as DomainStatsInfoSchema,
  StatsSchema as DomainStatsSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
  VersionResultSchema as DomainVersionResultSchema,
} from './model.js'
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

const StatusApiSchema = Schema.Struct({
  version: NullableString,
  running: NullableBoolean,
  protection_enabled: NullableBoolean,
  dns_addresses: NullableStringArray,
  dns_port: NullableNumber,
  http_port: NullableNumber,
  protection_disabled_duration: NullableNumber,
})

const TopListItemSchema = Schema.Record(Schema.String, Schema.Number)

const StatsApiSchema = Schema.Struct({
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

const StatsInfoApiSchema = Schema.Struct({ interval: NullableNumber })

const QuestionSchema = Schema.Struct({
  name: NullableString,
  type: NullableString,
})

const AnswerSchema = Schema.Struct({
  value: Schema.optional(Schema.NullOr(StringOrNumber)),
})

const QueryLogEntryApiSchema = Schema.Struct({
  time: NullableString,
  client: NullableString,
  question: Schema.optional(Schema.NullOr(QuestionSchema)),
  status: NullableString,
  reason: NullableString,
  elapsedMs: Schema.optional(Schema.NullOr(StringOrNumber)),
  answer: Schema.optional(Schema.NullOr(Schema.Array(AnswerSchema))),
})

const QueryLogResponseApiSchema = Schema.Struct({ data: Schema.Array(QueryLogEntryApiSchema) })

const PersistentClientApiSchema = Schema.Struct({
  name: NullableString,
  ids: NullableStringArray,
  tags: NullableStringArray,
  upstreams: NullableStringArray,
  filtering_enabled: NullableBoolean,
  use_global_settings: NullableBoolean,
  blocked_services: NullableStringArray,
})

const AutoClientApiSchema = Schema.Struct({
  name: NullableString,
  ip: NullableString,
  source: NullableString,
})

const ClientsApiSchema = Schema.Struct({
  clients: Schema.optional(Schema.NullOr(Schema.Array(PersistentClientApiSchema))),
  auto_clients: Schema.optional(Schema.NullOr(Schema.Array(AutoClientApiSchema))),
})

const ActiveClientsApiSchema = Schema.Array(Schema.Record(Schema.String, AutoClientApiSchema))

const FilterApiSchema = Schema.Struct({
  id: NullableNumber,
  name: NullableString,
  enabled: NullableBoolean,
  rules_count: NullableNumber,
  last_updated: NullableString,
  url: NullableString,
})

const FilteringStatusApiSchema = Schema.Struct({
  enabled: NullableBoolean,
  interval: NullableNumber,
  user_rules: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  filters: Schema.optional(Schema.NullOr(Schema.Array(FilterApiSchema))),
  whitelist_filters: Schema.optional(Schema.NullOr(Schema.Array(FilterApiSchema))),
})

const DhcpStatusApiSchema = Schema.Struct({
  enabled: NullableBoolean,
  interface_name: NullableString,
  v4: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  v6: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  leases: Schema.optional(Schema.NullOr(Schema.Array(JsonObjectSchema))),
  static_leases: Schema.optional(Schema.NullOr(Schema.Array(JsonObjectSchema))),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const systemStatusFromApi = (status: typeof StatusApiSchema.Type): SystemStatus => ({
  version: fromNullable(status.version),
  running: fromNullable(status.running),
  protectionEnabled: fromNullable(status.protection_enabled),
  dnsAddresses: fromNullable(status.dns_addresses),
  dnsPort: fromNullable(status.dns_port),
  httpPort: fromNullable(status.http_port),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApiSchema.Type => ({
  version: status.version,
  running: status.running,
  protection_enabled: status.protectionEnabled,
  dns_addresses: status.dnsAddresses,
  dns_port: status.dnsPort,
  http_port: status.httpPort,
  protection_disabled_duration: status.protectionDisabledDuration,
})

export const StatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const versionFromApi = (status: typeof StatusApiSchema.Type): VersionResult => ({
  version: fromNullable(status.version),
})

const versionToApi = (version: VersionResult): typeof StatusApiSchema.Type => ({ version: version.version })

export const VersionStatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainVersionResultSchema, {
    decode: SchemaGetter.transform(versionFromApi),
    encode: SchemaGetter.transform(versionToApi),
  })
)

const protectionStateFromApi = (status: typeof StatusApiSchema.Type): ProtectionState => ({
  protectionEnabled: fromNullable(status.protection_enabled),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

const protectionStateToApi = (state: ProtectionState): typeof StatusApiSchema.Type => ({
  protection_enabled: state.protectionEnabled,
  protection_disabled_duration: state.protectionDisabledDuration,
})

export const ProtectionStateStatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainProtectionStateSchema, {
    decode: SchemaGetter.transform(protectionStateFromApi),
    encode: SchemaGetter.transform(protectionStateToApi),
  })
)

const topRecordsFromApi = (
  records: ReadonlyArray<typeof TopListItemSchema.Type> | null | undefined
): ReadonlyArray<TopRecord> =>
  (records ?? []).flatMap((record) => Object.entries(record).map(([name, count]) => ({ name, count }))).slice(0, 10)

const topRecordsToApi = (records: ReadonlyArray<TopRecord>): ReadonlyArray<typeof TopListItemSchema.Type> =>
  records.map((record) => ({ [record.name]: record.count }))

const statsFromApi = (stats: typeof StatsApiSchema.Type): Stats => ({
  numDnsQueries: fromNullable(stats.num_dns_queries),
  numBlockedFiltering: fromNullable(stats.num_blocked_filtering),
  numReplacedSafebrowsing: fromNullable(stats.num_replaced_safebrowsing),
  numReplacedParental: fromNullable(stats.num_replaced_parental),
  numReplacedSafesearch: fromNullable(stats.num_replaced_safesearch),
  avgProcessingTime: fromNullable(stats.avg_processing_time),
  timeUnits: fromNullable(stats.time_units),
  topQueriedDomains: topRecordsFromApi(stats.top_queried_domains),
  topBlockedDomains: topRecordsFromApi(stats.top_blocked_domains),
  topClients: topRecordsFromApi(stats.top_clients),
})

const statsToApi = (stats: Stats): typeof StatsApiSchema.Type => ({
  num_dns_queries: stats.numDnsQueries,
  num_blocked_filtering: stats.numBlockedFiltering,
  num_replaced_safebrowsing: stats.numReplacedSafebrowsing,
  num_replaced_parental: stats.numReplacedParental,
  num_replaced_safesearch: stats.numReplacedSafesearch,
  avg_processing_time: stats.avgProcessingTime,
  time_units: stats.timeUnits,
  top_queried_domains: topRecordsToApi(stats.topQueriedDomains),
  top_blocked_domains: topRecordsToApi(stats.topBlockedDomains),
  top_clients: topRecordsToApi(stats.topClients),
})

export const StatsSchema = StatsApiSchema.pipe(
  Schema.decodeTo(DomainStatsSchema, {
    decode: SchemaGetter.transform(statsFromApi),
    encode: SchemaGetter.transform(statsToApi),
  })
)

const statsInfoFromApi = (statsInfo: typeof StatsInfoApiSchema.Type): StatsInfo => ({
  interval: fromNullable(statsInfo.interval),
})

const statsInfoToApi = (statsInfo: StatsInfo): typeof StatsInfoApiSchema.Type => ({ interval: statsInfo.interval })

export const StatsInfoSchema = StatsInfoApiSchema.pipe(
  Schema.decodeTo(DomainStatsInfoSchema, {
    decode: SchemaGetter.transform(statsInfoFromApi),
    encode: SchemaGetter.transform(statsInfoToApi),
  })
)

const queryLogEntryFromApi = (entry: typeof QueryLogEntryApiSchema.Type): QueryLogEntry => ({
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

const queryLogEntryToApi = (entry: QueryLogEntry): typeof QueryLogEntryApiSchema.Type => ({
  time: entry.time,
  client: entry.client,
  question: { name: entry.question, type: entry.type },
  status: entry.status,
  reason: entry.reason,
  elapsedMs: entry.elapsedMs,
  answer: entry.answer.length === 0 ? [] : [{ value: entry.answer }],
})

const queryLogResponseFromApi = (response: typeof QueryLogResponseApiSchema.Type): ListResult<QueryLogEntry> => ({
  count: response.data.length,
  records: response.data.map(queryLogEntryFromApi),
})

const queryLogResponseToApi = (result: ListResult<QueryLogEntry>): typeof QueryLogResponseApiSchema.Type => ({
  data: result.records.map(queryLogEntryToApi),
})

export const QueryLogResponseSchema = QueryLogResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainQueryLogEntrySchema), {
    decode: SchemaGetter.transform(queryLogResponseFromApi),
    encode: SchemaGetter.transform(queryLogResponseToApi),
  })
)

const persistentClientFromApi = (client: typeof PersistentClientApiSchema.Type): PersistentClient => ({
  name: fromNullable(client.name),
  ids: fromNullable(client.ids),
  tags: fromNullable(client.tags),
  upstreams: fromNullable(client.upstreams),
  filteringEnabled: fromNullable(client.filtering_enabled),
  useGlobalSettings: fromNullable(client.use_global_settings),
  blockedServices: fromNullable(client.blocked_services),
})

const persistentClientToApi = (client: PersistentClient): typeof PersistentClientApiSchema.Type => ({
  name: client.name,
  ids: client.ids,
  tags: client.tags,
  upstreams: client.upstreams,
  filtering_enabled: client.filteringEnabled,
  use_global_settings: client.useGlobalSettings,
  blocked_services: client.blockedServices,
})

const autoClientFromApi = (client: typeof AutoClientApiSchema.Type): AutoClient => ({
  name: fromNullable(client.name),
  ip: fromNullable(client.ip),
  source: fromNullable(client.source),
})

const autoClientToApi = (client: AutoClient): typeof AutoClientApiSchema.Type => ({
  name: client.name,
  ip: client.ip,
  source: client.source,
})

const clientsResultFromApi = (clients: typeof ClientsApiSchema.Type): ClientsResult => {
  const autoClients = clients.auto_clients ?? []
  return {
    configured: (clients.clients ?? []).map(persistentClientFromApi),
    autoCount: autoClients.length,
    autoSample: autoClients.slice(0, 10).map(autoClientFromApi),
  }
}

const clientsResultToApi = (clients: ClientsResult): typeof ClientsApiSchema.Type => ({
  clients: clients.configured.map(persistentClientToApi),
  auto_clients: clients.autoSample.map(autoClientToApi),
})

export const ClientsSchema = ClientsApiSchema.pipe(
  Schema.decodeTo(DomainClientsResultSchema, {
    decode: SchemaGetter.transform(clientsResultFromApi),
    encode: SchemaGetter.transform(clientsResultToApi),
  })
)

const activeClientsFromApi = (clients: typeof ActiveClientsApiSchema.Type): ReadonlyArray<ActiveClient> =>
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

const activeClientsToApi = (clients: ReadonlyArray<ActiveClient>): typeof ActiveClientsApiSchema.Type =>
  clients.map((client) => ({ [client.ip]: { name: client.name, ip: client.ids?.[0], source: client.source } }))

export const ActiveClientsSchema = ActiveClientsApiSchema.pipe(
  Schema.decodeTo(Schema.Array(DomainActiveClientSchema), {
    decode: SchemaGetter.transform(activeClientsFromApi),
    encode: SchemaGetter.transform(activeClientsToApi),
  })
)

const filterRecordFromApi = (filter: typeof FilterApiSchema.Type): FilterRecord => ({
  id: fromNullable(filter.id),
  name: fromNullable(filter.name),
  enabled: fromNullable(filter.enabled),
  rulesCount: fromNullable(filter.rules_count),
  lastUpdated: fromNullable(filter.last_updated),
  url: fromNullable(filter.url),
})

const filterRecordToApi = (filter: FilterRecord): typeof FilterApiSchema.Type => ({
  id: filter.id,
  name: filter.name,
  enabled: filter.enabled,
  rules_count: filter.rulesCount,
  last_updated: filter.lastUpdated,
  url: filter.url,
})

const filtersResultFromApi = (status: typeof FilteringStatusApiSchema.Type): FiltersResult => ({
  enabled: fromNullable(status.enabled),
  intervalHours: fromNullable(status.interval),
  userRulesCount: (status.user_rules ?? []).length,
  blocklists: (status.filters ?? []).map(filterRecordFromApi),
  allowlists: (status.whitelist_filters ?? []).map(filterRecordFromApi),
})

const filtersResultToApi = (status: FiltersResult): typeof FilteringStatusApiSchema.Type => ({
  enabled: status.enabled,
  interval: status.intervalHours,
  filters: status.blocklists.map(filterRecordToApi),
  whitelist_filters: status.allowlists.map(filterRecordToApi),
})

export const FilteringStatusSchema = FilteringStatusApiSchema.pipe(
  Schema.decodeTo(DomainFiltersResultSchema, {
    decode: SchemaGetter.transform(filtersResultFromApi),
    encode: SchemaGetter.transform(filtersResultToApi),
  })
)

const filteringRulesFromApi = (status: typeof FilteringStatusApiSchema.Type): ListResult<string> => {
  const records = status.user_rules ?? []
  return { count: records.length, records }
}

const filteringRulesToApi = (result: ListResult<string>): typeof FilteringStatusApiSchema.Type => ({
  user_rules: result.records,
})

export const FilteringRulesSchema = FilteringStatusApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(Schema.String), {
    decode: SchemaGetter.transform(filteringRulesFromApi),
    encode: SchemaGetter.transform(filteringRulesToApi),
  })
)

const jsonObject = (value: typeof JsonObjectSchema.Type | null | undefined): JsonObject | undefined =>
  value === null ? undefined : value

const jsonObjects = (
  value: ReadonlyArray<typeof JsonObjectSchema.Type> | null | undefined
): ReadonlyArray<JsonObject> => value ?? []

const dhcpStatusFromApi = (status: typeof DhcpStatusApiSchema.Type): DhcpStatus => {
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

const dhcpStatusToApi = (status: DhcpStatus): typeof DhcpStatusApiSchema.Type => ({
  enabled: status.enabled,
  interface_name: status.interfaceName,
  v4: status.v4,
  v6: status.v6,
  leases: status.leases,
  static_leases: status.staticLeases,
})

export const DhcpStatusSchema = DhcpStatusApiSchema.pipe(
  Schema.decodeTo(DomainDhcpStatusSchema, {
    decode: SchemaGetter.transform(dhcpStatusFromApi),
    encode: SchemaGetter.transform(dhcpStatusToApi),
  })
)
