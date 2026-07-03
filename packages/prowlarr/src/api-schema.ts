import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  ApplicationRecord as DomainApplicationRecord,
  CommandResult as DomainCommandResult,
  HealthRecord as DomainHealthRecord,
  HistoryRecord as DomainHistoryRecord,
  IndexerRecord as DomainIndexerRecord,
  IndexerStatsRecord as DomainIndexerStatsRecord,
  ListResultSchema as DomainListResultSchema,
  ReleaseRecord as DomainReleaseRecord,
  SystemStatus as DomainSystemStatus,
} from './model.js'
import type {
  ApplicationRecord,
  CommandResult,
  HealthRecord,
  HistoryRecord,
  IndexerRecord,
  IndexerStatsRecord,
  ListResult,
  ReleaseRecord,
  SystemStatus,
} from './model.js'

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const NullableNumber = Schema.Number.pipe(Schema.NullOr, Schema.optional)
const NullableBoolean = Schema.Boolean.pipe(Schema.NullOr, Schema.optional)
const NullableNumberArray = Schema.Array(Schema.Number).pipe(Schema.NullOr, Schema.optional)

const ReleaseCategory = Schema.Union([Schema.String, Schema.Number])
const ElapsedTime = Schema.Union([Schema.String, Schema.Number]).pipe(Schema.NullOr, Schema.optional)

const StatusApi = Schema.Struct({
  appName: NullableString,
  version: Schema.String,
  instanceName: NullableString,
  branch: NullableString,
  runtimeVersion: NullableString,
  osName: NullableString,
  osVersion: NullableString,
  buildTime: NullableString,
  isLinux: NullableBoolean,
  isProduction: NullableBoolean,
})

const HealthRecordApi = Schema.Struct({
  source: NullableString,
  type: NullableString,
  message: Schema.String,
  wikiUrl: NullableString,
})

const IndexerRecordApi = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  protocol: NullableString,
  enable: NullableBoolean,
  priority: NullableNumber,
  supportsSearch: NullableBoolean,
  supportsRss: NullableBoolean,
  implementation: NullableString,
  implementationName: NullableString,
})

const IndexerStatsRecordApi = Schema.Struct({
  indexerId: Schema.Number,
  indexerName: Schema.String,
  numberOfQueries: NullableNumber,
  numberOfGrabs: NullableNumber,
  numberOfFailedQueries: NullableNumber,
  numberOfFailedGrabs: NullableNumber,
  averageResponseTime: NullableNumber,
})

const IndexerStatsResponseApi = Schema.Struct({
  indexers: Schema.Array(IndexerStatsRecordApi),
})

const ReleaseRecordApi = Schema.Struct({
  guid: NullableString,
  indexerId: NullableNumber,
  indexer: NullableString,
  title: Schema.String,
  protocol: NullableString,
  size: NullableNumber,
  seeders: NullableNumber,
  leechers: NullableNumber,
  grabs: NullableNumber,
  age: NullableNumber,
  publishDate: NullableString,
  downloadUrl: NullableString,
  infoUrl: NullableString,
  categories: Schema.Array(ReleaseCategory).pipe(Schema.NullOr, Schema.optional),
})

const ApplicationRecordApi = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  implementation: NullableString,
  syncLevel: NullableString,
  tags: NullableNumberArray,
})

const CommandRecordApi = Schema.Struct({
  id: NullableNumber,
  name: Schema.String,
  status: NullableString,
  queued: NullableString,
  started: NullableString,
  ended: NullableString,
})

const HistoryData = Schema.Struct({
  successful: NullableBoolean,
  query: NullableString,
  queryType: NullableString,
  results: NullableNumber,
  elapsedTime: ElapsedTime,
})

const HistoryRecordApi = Schema.Struct({
  id: NullableNumber,
  date: NullableString,
  eventType: Schema.String,
  indexerId: NullableNumber,
  data: HistoryData.pipe(Schema.NullOr, Schema.optional),
})

// The decoded domain model models field absence with `Schema.optional` (`T | undefined`),
// which the plugin allows. These two boundary helpers bridge the nullable wire shape
// (`T | null | undefined`) onto that domain shape, so their signatures must name the union.
// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper bridging nullable wire value onto Schema.optional domain field
const fromNullable = <A>(value: A | null | undefined): A | undefined =>
  Option.getOrUndefined(Option.fromNullishOr(value))

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper producing the Schema.optional domain shape (`number | undefined`)
const sizeMB = (size: number | undefined): number | undefined =>
  Option.getOrUndefined(Option.map(Option.fromNullishOr(size), (value) => Math.floor(value / 1_048_576)))

const systemStatusFromApi = (status: typeof StatusApi.Type): SystemStatus => ({
  appName: fromNullable(status.appName),
  version: status.version,
  instanceName: fromNullable(status.instanceName),
  branch: fromNullable(status.branch),
  runtimeVersion: fromNullable(status.runtimeVersion),
  osName: fromNullable(status.osName),
  osVersion: fromNullable(status.osVersion),
  buildTime: fromNullable(status.buildTime),
  isLinux: fromNullable(status.isLinux),
  isProduction: fromNullable(status.isProduction),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApi.Type => ({
  appName: status.appName,
  version: status.version,
  instanceName: status.instanceName,
  branch: status.branch,
  runtimeVersion: status.runtimeVersion,
  osName: status.osName,
  osVersion: status.osVersion,
  buildTime: status.buildTime,
  isLinux: status.isLinux,
  isProduction: status.isProduction,
})

export const StatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const healthRecordFromApi = (record: typeof HealthRecordApi.Type): HealthRecord => ({
  source: fromNullable(record.source),
  type: fromNullable(record.type),
  message: record.message,
  wikiUrl: fromNullable(record.wikiUrl),
})

const healthRecordToApi = (record: HealthRecord): typeof HealthRecordApi.Type => ({
  source: record.source,
  type: record.type,
  message: record.message,
  wikiUrl: record.wikiUrl,
})

export const HealthRecordSchema = HealthRecordApi.pipe(
  Schema.decodeTo(DomainHealthRecord, {
    decode: SchemaGetter.transform(healthRecordFromApi),
    encode: SchemaGetter.transform(healthRecordToApi),
  })
)

const indexerRecordFromApi = (record: typeof IndexerRecordApi.Type): IndexerRecord => ({
  id: record.id,
  name: record.name,
  protocol: fromNullable(record.protocol),
  enabled: fromNullable(record.enable),
  priority: fromNullable(record.priority),
  supportsSearch: fromNullable(record.supportsSearch),
  supportsRss: fromNullable(record.supportsRss),
  implementation: fromNullable(record.implementation),
  implementationName: fromNullable(record.implementationName),
})

const indexerRecordToApi = (record: IndexerRecord): typeof IndexerRecordApi.Type => ({
  id: record.id,
  name: record.name,
  protocol: record.protocol,
  enable: record.enabled,
  priority: record.priority,
  supportsSearch: record.supportsSearch,
  supportsRss: record.supportsRss,
  implementation: record.implementation,
  implementationName: record.implementationName,
})

export const IndexerRecordSchema = IndexerRecordApi.pipe(
  Schema.decodeTo(DomainIndexerRecord, {
    decode: SchemaGetter.transform(indexerRecordFromApi),
    encode: SchemaGetter.transform(indexerRecordToApi),
  })
)

const indexerStatsRecordFromApi = (record: typeof IndexerStatsRecordApi.Type): IndexerStatsRecord => ({
  id: record.indexerId,
  name: record.indexerName,
  queries: fromNullable(record.numberOfQueries),
  grabs: fromNullable(record.numberOfGrabs),
  failedQueries: fromNullable(record.numberOfFailedQueries),
  failedGrabs: fromNullable(record.numberOfFailedGrabs),
  avgResponseTimeMs: fromNullable(record.averageResponseTime),
})

const indexerStatsRecordToApi = (record: IndexerStatsRecord): typeof IndexerStatsRecordApi.Type => ({
  indexerId: record.id,
  indexerName: record.name,
  numberOfQueries: record.queries,
  numberOfGrabs: record.grabs,
  numberOfFailedQueries: record.failedQueries,
  numberOfFailedGrabs: record.failedGrabs,
  averageResponseTime: record.avgResponseTimeMs,
})

const releaseRecordFromApi = (record: typeof ReleaseRecordApi.Type): ReleaseRecord => {
  const size = fromNullable(record.size)

  return {
    guid: fromNullable(record.guid),
    indexerId: fromNullable(record.indexerId),
    indexer: fromNullable(record.indexer),
    title: record.title,
    protocol: fromNullable(record.protocol),
    size,
    sizeMB: sizeMB(size),
    seeders: fromNullable(record.seeders),
    leechers: fromNullable(record.leechers),
    grabs: fromNullable(record.grabs),
    age: fromNullable(record.age),
    publishDate: fromNullable(record.publishDate),
    downloadUrl: fromNullable(record.downloadUrl),
    infoUrl: fromNullable(record.infoUrl),
    categories: fromNullable(record.categories),
  }
}

const releaseRecordToApi = (record: ReleaseRecord): typeof ReleaseRecordApi.Type => ({
  guid: record.guid,
  indexerId: record.indexerId,
  indexer: record.indexer,
  title: record.title,
  protocol: record.protocol,
  size: record.size,
  seeders: record.seeders,
  leechers: record.leechers,
  grabs: record.grabs,
  age: record.age,
  publishDate: record.publishDate,
  downloadUrl: record.downloadUrl,
  infoUrl: record.infoUrl,
  categories: record.categories,
})

export const ReleaseRecordSchema = ReleaseRecordApi.pipe(
  Schema.decodeTo(DomainReleaseRecord, {
    decode: SchemaGetter.transform(releaseRecordFromApi),
    encode: SchemaGetter.transform(releaseRecordToApi),
  })
)

const applicationRecordFromApi = (record: typeof ApplicationRecordApi.Type): ApplicationRecord => ({
  id: record.id,
  name: record.name,
  implementation: fromNullable(record.implementation),
  syncLevel: fromNullable(record.syncLevel),
  tags: fromNullable(record.tags),
})

const applicationRecordToApi = (record: ApplicationRecord): typeof ApplicationRecordApi.Type => ({
  id: record.id,
  name: record.name,
  implementation: record.implementation,
  syncLevel: record.syncLevel,
  tags: record.tags,
})

export const ApplicationRecordSchema = ApplicationRecordApi.pipe(
  Schema.decodeTo(DomainApplicationRecord, {
    decode: SchemaGetter.transform(applicationRecordFromApi),
    encode: SchemaGetter.transform(applicationRecordToApi),
  })
)

const commandResultFromApi = (record: typeof CommandRecordApi.Type): CommandResult => ({
  id: fromNullable(record.id),
  name: record.name,
  status: fromNullable(record.status),
  queued: fromNullable(record.queued),
  started: fromNullable(record.started),
  ended: fromNullable(record.ended),
})

const commandResultToApi = (record: CommandResult): typeof CommandRecordApi.Type => ({
  id: record.id,
  name: record.name,
  status: record.status,
  queued: record.queued,
  started: record.started,
  ended: record.ended,
})

export const CommandRecordSchema = CommandRecordApi.pipe(
  Schema.decodeTo(DomainCommandResult, {
    decode: SchemaGetter.transform(commandResultFromApi),
    encode: SchemaGetter.transform(commandResultToApi),
  })
)

const historyRecordFromApi = (record: typeof HistoryRecordApi.Type): HistoryRecord => ({
  id: fromNullable(record.id),
  date: fromNullable(record.date),
  eventType: record.eventType,
  indexerId: fromNullable(record.indexerId),
  successful: fromNullable(record.data?.successful),
  query: fromNullable(record.data?.query),
  queryType: fromNullable(record.data?.queryType),
  results: fromNullable(record.data?.results),
  elapsedTime: fromNullable(record.data?.elapsedTime),
})

const historyRecordToApi = (record: HistoryRecord): typeof HistoryRecordApi.Type => ({
  id: record.id,
  date: record.date,
  eventType: record.eventType,
  indexerId: record.indexerId,
  data: {
    successful: record.successful,
    query: record.query,
    queryType: record.queryType,
    results: record.results,
    elapsedTime: record.elapsedTime,
  },
})

const HistoryRecordSchema = HistoryRecordApi.pipe(
  Schema.decodeTo(DomainHistoryRecord, {
    decode: SchemaGetter.transform(historyRecordFromApi),
    encode: SchemaGetter.transform(historyRecordToApi),
  })
)

export const IndexerStatsResponseSchema = IndexerStatsResponseApi.pipe(
  Schema.decodeTo(Schema.Array(DomainIndexerStatsRecord), {
    decode: SchemaGetter.transform((response: typeof IndexerStatsResponseApi.Type) =>
      response.indexers.map(indexerStatsRecordFromApi)
    ),
    encode: SchemaGetter.transform((records: ReadonlyArray<IndexerStatsRecord>) => ({
      indexers: records.map(indexerStatsRecordToApi),
    })),
  })
)

const HistoryResponseApi = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

const historyResponseFromApi = (response: typeof HistoryResponseApi.Type): ListResult<HistoryRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const historyResponseToApi = (result: ListResult<HistoryRecord>): typeof HistoryResponseApi.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const HistoryResponseSchema = HistoryResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainHistoryRecord), {
    decode: SchemaGetter.transform(historyResponseFromApi),
    encode: SchemaGetter.transform(historyResponseToApi),
  })
)
