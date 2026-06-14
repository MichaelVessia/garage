import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as Str from 'effect/String'

import {
  ActiveClient as DomainActiveClient,
  ClientsResult as DomainClientsResult,
  DhcpStatus as DomainDhcpStatus,
  FiltersResult as DomainFiltersResult,
  ListResult as DomainListResult,
  ProtectionState as DomainProtectionState,
  QueryLogEntry as DomainQueryLogEntry,
  Stats as DomainStats,
  StatsInfo as DomainStatsInfo,
  SystemStatus as DomainSystemStatus,
  VersionResult as DomainVersionResult,
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

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const NullableNumber = Schema.Number.pipe(Schema.NullOr, Schema.optional)
const NullableBoolean = Schema.Boolean.pipe(Schema.NullOr, Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])
export const JsonObjectApi = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObjectApi = typeof JsonObjectApi.Type

const StatusApi = Schema.Struct({
  version: NullableString,
  running: NullableBoolean,
  protection_enabled: NullableBoolean,
  dns_addresses: NullableStringArray,
  dns_port: NullableNumber,
  http_port: NullableNumber,
  protection_disabled_duration: NullableNumber,
})

const TopListItem = Schema.Record(Schema.String, Schema.Number)

const StatsApi = Schema.Struct({
  num_dns_queries: NullableNumber,
  num_blocked_filtering: NullableNumber,
  num_replaced_safebrowsing: NullableNumber,
  num_replaced_parental: NullableNumber,
  num_replaced_safesearch: NullableNumber,
  avg_processing_time: NullableNumber,
  time_units: NullableString,
  top_queried_domains: Schema.Array(TopListItem).pipe(Schema.NullOr, Schema.optional),
  top_blocked_domains: Schema.Array(TopListItem).pipe(Schema.NullOr, Schema.optional),
  top_clients: Schema.Array(TopListItem).pipe(Schema.NullOr, Schema.optional),
})

const StatsInfoApi = Schema.Struct({ interval: NullableNumber })

const Question = Schema.Struct({
  name: NullableString,
  type: NullableString,
})

const Answer = Schema.Struct({
  value: StringOrNumber.pipe(Schema.NullOr, Schema.optional),
})

const QueryLogEntryApi = Schema.Struct({
  time: NullableString,
  client: NullableString,
  question: Question.pipe(Schema.NullOr, Schema.optional),
  status: NullableString,
  reason: NullableString,
  elapsedMs: StringOrNumber.pipe(Schema.NullOr, Schema.optional),
  answer: Schema.Array(Answer).pipe(Schema.NullOr, Schema.optional),
})

const QueryLogResponseApi = Schema.Struct({ data: Schema.Array(QueryLogEntryApi) })

const PersistentClientApi = Schema.Struct({
  name: NullableString,
  ids: NullableStringArray,
  tags: NullableStringArray,
  upstreams: NullableStringArray,
  filtering_enabled: NullableBoolean,
  use_global_settings: NullableBoolean,
  blocked_services: NullableStringArray,
})

const AutoClientApi = Schema.Struct({
  name: NullableString,
  ip: NullableString,
  source: NullableString,
})

const ClientsApi = Schema.Struct({
  clients: Schema.Array(PersistentClientApi).pipe(Schema.NullOr, Schema.optional),
  auto_clients: Schema.Array(AutoClientApi).pipe(Schema.NullOr, Schema.optional),
})

const ActiveClientsApi = Schema.Array(Schema.Record(Schema.String, AutoClientApi))

const FilterApi = Schema.Struct({
  id: NullableNumber,
  name: NullableString,
  enabled: NullableBoolean,
  rules_count: NullableNumber,
  last_updated: NullableString,
  url: NullableString,
})

const FilteringStatusApi = Schema.Struct({
  enabled: NullableBoolean,
  interval: NullableNumber,
  user_rules: Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional),
  filters: Schema.Array(FilterApi).pipe(Schema.NullOr, Schema.optional),
  whitelist_filters: Schema.Array(FilterApi).pipe(Schema.NullOr, Schema.optional),
})

const DhcpStatusApi = Schema.Struct({
  enabled: NullableBoolean,
  interface_name: NullableString,
  v4: JsonObjectApi.pipe(Schema.NullOr, Schema.optional),
  v6: JsonObjectApi.pipe(Schema.NullOr, Schema.optional),
  leases: Schema.Array(JsonObjectApi).pipe(Schema.NullOr, Schema.optional),
  static_leases: Schema.Array(JsonObjectApi).pipe(Schema.NullOr, Schema.optional),
})

// oxlint-disable-next-line effect/prefer-option-over-null -- wire boundary: AdGuard fields decode as A | null | undefined (Schema.optional(NullOr)); the domain model models absence as A | undefined, not Option
const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const systemStatusFromApi = (status: typeof StatusApi.Type): SystemStatus => ({
  version: fromNullable(status.version),
  running: fromNullable(status.running),
  protectionEnabled: fromNullable(status.protection_enabled),
  dnsAddresses: fromNullable(status.dns_addresses),
  dnsPort: fromNullable(status.dns_port),
  httpPort: fromNullable(status.http_port),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApi.Type => ({
  version: status.version,
  running: status.running,
  protection_enabled: status.protectionEnabled,
  dns_addresses: status.dnsAddresses,
  dns_port: status.dnsPort,
  http_port: status.httpPort,
  protection_disabled_duration: status.protectionDisabledDuration,
})

export const StatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const versionFromApi = (status: typeof StatusApi.Type): VersionResult => ({
  version: fromNullable(status.version),
})

const versionToApi = (version: VersionResult): typeof StatusApi.Type => ({ version: version.version })

export const VersionStatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainVersionResult, {
    decode: SchemaGetter.transform(versionFromApi),
    encode: SchemaGetter.transform(versionToApi),
  })
)

const protectionStateFromApi = (status: typeof StatusApi.Type): ProtectionState => ({
  protectionEnabled: fromNullable(status.protection_enabled),
  protectionDisabledDuration: fromNullable(status.protection_disabled_duration),
})

const protectionStateToApi = (state: ProtectionState): typeof StatusApi.Type => ({
  protection_enabled: state.protectionEnabled,
  protection_disabled_duration: state.protectionDisabledDuration,
})

export const ProtectionStateStatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainProtectionState, {
    decode: SchemaGetter.transform(protectionStateFromApi),
    encode: SchemaGetter.transform(protectionStateToApi),
  })
)

const topRecordsFromApi = (
  // oxlint-disable-next-line effect/prefer-option-over-null -- wire boundary: AdGuard returns this array field as value | null | undefined
  records: ReadonlyArray<typeof TopListItem.Type> | null | undefined
): ReadonlyArray<TopRecord> =>
  (records ?? []).flatMap((record) => R.toEntries(record).map(([name, count]) => ({ name, count }))).slice(0, 10)

const topRecordsToApi = (records: ReadonlyArray<TopRecord>): ReadonlyArray<typeof TopListItem.Type> =>
  records.map((record) => ({ [record.name]: record.count }))

const statsFromApi = (stats: typeof StatsApi.Type): Stats => ({
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

const statsToApi = (stats: Stats): typeof StatsApi.Type => ({
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

export const StatsSchema = StatsApi.pipe(
  Schema.decodeTo(DomainStats, {
    decode: SchemaGetter.transform(statsFromApi),
    encode: SchemaGetter.transform(statsToApi),
  })
)

const statsInfoFromApi = (statsInfo: typeof StatsInfoApi.Type): StatsInfo => ({
  interval: fromNullable(statsInfo.interval),
})

const statsInfoToApi = (statsInfo: StatsInfo): typeof StatsInfoApi.Type => ({ interval: statsInfo.interval })

export const StatsInfoSchema = StatsInfoApi.pipe(
  Schema.decodeTo(DomainStatsInfo, {
    decode: SchemaGetter.transform(statsInfoFromApi),
    encode: SchemaGetter.transform(statsInfoToApi),
  })
)

const queryLogEntryFromApi = (entry: typeof QueryLogEntryApi.Type): QueryLogEntry => ({
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

const queryLogEntryToApi = (entry: QueryLogEntry): typeof QueryLogEntryApi.Type => ({
  time: entry.time,
  client: entry.client,
  question: { name: entry.question, type: entry.type },
  status: entry.status,
  reason: entry.reason,
  elapsedMs: entry.elapsedMs,
  answer: Str.isEmpty(entry.answer) ? [] : [{ value: entry.answer }],
})

const queryLogResponseFromApi = (response: typeof QueryLogResponseApi.Type): ListResult<QueryLogEntry> => ({
  count: response.data.length,
  records: response.data.map(queryLogEntryFromApi),
})

const queryLogResponseToApi = (result: ListResult<QueryLogEntry>): typeof QueryLogResponseApi.Type => ({
  data: result.records.map(queryLogEntryToApi),
})

export const QueryLogResponseSchema = QueryLogResponseApi.pipe(
  Schema.decodeTo(DomainListResult(DomainQueryLogEntry), {
    decode: SchemaGetter.transform(queryLogResponseFromApi),
    encode: SchemaGetter.transform(queryLogResponseToApi),
  })
)

const persistentClientFromApi = (client: typeof PersistentClientApi.Type): PersistentClient => ({
  name: fromNullable(client.name),
  ids: fromNullable(client.ids),
  tags: fromNullable(client.tags),
  upstreams: fromNullable(client.upstreams),
  filteringEnabled: fromNullable(client.filtering_enabled),
  useGlobalSettings: fromNullable(client.use_global_settings),
  blockedServices: fromNullable(client.blocked_services),
})

const persistentClientToApi = (client: PersistentClient): typeof PersistentClientApi.Type => ({
  name: client.name,
  ids: client.ids,
  tags: client.tags,
  upstreams: client.upstreams,
  filtering_enabled: client.filteringEnabled,
  use_global_settings: client.useGlobalSettings,
  blocked_services: client.blockedServices,
})

const autoClientFromApi = (client: typeof AutoClientApi.Type): AutoClient => ({
  name: fromNullable(client.name),
  ip: fromNullable(client.ip),
  source: fromNullable(client.source),
})

const autoClientToApi = (client: AutoClient): typeof AutoClientApi.Type => ({
  name: client.name,
  ip: client.ip,
  source: client.source,
})

const clientsResultFromApi = (clients: typeof ClientsApi.Type): ClientsResult => {
  const autoClients = clients.auto_clients ?? []
  return {
    configured: (clients.clients ?? []).map(persistentClientFromApi),
    autoCount: autoClients.length,
    autoSample: autoClients.slice(0, 10).map(autoClientFromApi),
  }
}

const clientsResultToApi = (clients: ClientsResult): typeof ClientsApi.Type => ({
  clients: clients.configured.map(persistentClientToApi),
  auto_clients: clients.autoSample.map(autoClientToApi),
})

export const ClientsSchema = ClientsApi.pipe(
  Schema.decodeTo(DomainClientsResult, {
    decode: SchemaGetter.transform(clientsResultFromApi),
    encode: SchemaGetter.transform(clientsResultToApi),
  })
)

const activeClientsFromApi = (clients: typeof ActiveClientsApi.Type): ReadonlyArray<ActiveClient> =>
  clients.flatMap((entry) =>
    R.toEntries(entry).map(([ip, client]) => {
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

const activeClientsToApi = (clients: ReadonlyArray<ActiveClient>): typeof ActiveClientsApi.Type =>
  clients.map((client) => ({ [client.ip]: { name: client.name, ip: client.ids?.[0], source: client.source } }))

export const ActiveClientsSchema = ActiveClientsApi.pipe(
  Schema.decodeTo(Schema.Array(DomainActiveClient), {
    decode: SchemaGetter.transform(activeClientsFromApi),
    encode: SchemaGetter.transform(activeClientsToApi),
  })
)

const filterRecordFromApi = (filter: typeof FilterApi.Type): FilterRecord => ({
  id: fromNullable(filter.id),
  name: fromNullable(filter.name),
  enabled: fromNullable(filter.enabled),
  rulesCount: fromNullable(filter.rules_count),
  lastUpdated: fromNullable(filter.last_updated),
  url: fromNullable(filter.url),
})

const filterRecordToApi = (filter: FilterRecord): typeof FilterApi.Type => ({
  id: filter.id,
  name: filter.name,
  enabled: filter.enabled,
  rules_count: filter.rulesCount,
  last_updated: filter.lastUpdated,
  url: filter.url,
})

const filtersResultFromApi = (status: typeof FilteringStatusApi.Type): FiltersResult => ({
  enabled: fromNullable(status.enabled),
  intervalHours: fromNullable(status.interval),
  userRulesCount: (status.user_rules ?? []).length,
  blocklists: (status.filters ?? []).map(filterRecordFromApi),
  allowlists: (status.whitelist_filters ?? []).map(filterRecordFromApi),
})

const filtersResultToApi = (status: FiltersResult): typeof FilteringStatusApi.Type => ({
  enabled: status.enabled,
  interval: status.intervalHours,
  filters: status.blocklists.map(filterRecordToApi),
  whitelist_filters: status.allowlists.map(filterRecordToApi),
})

export const FilteringStatusSchema = FilteringStatusApi.pipe(
  Schema.decodeTo(DomainFiltersResult, {
    decode: SchemaGetter.transform(filtersResultFromApi),
    encode: SchemaGetter.transform(filtersResultToApi),
  })
)

const filteringRulesFromApi = (status: typeof FilteringStatusApi.Type): ListResult<string> => {
  const records = status.user_rules ?? []
  return { count: records.length, records }
}

const filteringRulesToApi = (result: ListResult<string>): typeof FilteringStatusApi.Type => ({
  user_rules: result.records,
})

export const FilteringRulesSchema = FilteringStatusApi.pipe(
  Schema.decodeTo(DomainListResult(Schema.String), {
    decode: SchemaGetter.transform(filteringRulesFromApi),
    encode: SchemaGetter.transform(filteringRulesToApi),
  })
)

// oxlint-disable-next-line effect/prefer-option-over-null -- wire boundary: AdGuard DHCP object decodes as value | null | undefined; the domain model models absence as JsonObject | undefined, not Option
const jsonObject = (value: typeof JsonObjectApi.Type | null | undefined): JsonObject | undefined =>
  value === null ? undefined : value

const jsonObjects = (
  // oxlint-disable-next-line effect/prefer-option-over-null -- wire boundary: AdGuard DHCP lease arrays decode as value | null | undefined
  value: ReadonlyArray<typeof JsonObjectApi.Type> | null | undefined
): ReadonlyArray<JsonObject> => value ?? []

const dhcpStatusFromApi = (status: typeof DhcpStatusApi.Type): DhcpStatus => {
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

const dhcpStatusToApi = (status: DhcpStatus): typeof DhcpStatusApi.Type => ({
  enabled: status.enabled,
  interface_name: status.interfaceName,
  v4: status.v4,
  v6: status.v6,
  leases: status.leases,
  static_leases: status.staticLeases,
})

export const DhcpStatusSchema = DhcpStatusApi.pipe(
  Schema.decodeTo(DomainDhcpStatus, {
    decode: SchemaGetter.transform(dhcpStatusFromApi),
    encode: SchemaGetter.transform(dhcpStatusToApi),
  })
)
