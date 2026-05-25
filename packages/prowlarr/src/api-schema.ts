import { Schema, SchemaGetter } from 'effect'

import {
  ApplicationRecordSchema as DomainApplicationRecordSchema,
  CommandResultSchema as DomainCommandResultSchema,
  HealthRecordSchema as DomainHealthRecordSchema,
  HistoryRecordSchema as DomainHistoryRecordSchema,
  IndexerRecordSchema as DomainIndexerRecordSchema,
  IndexerStatsRecordSchema as DomainIndexerStatsRecordSchema,
  ListResultSchema as DomainListResultSchema,
  ReleaseRecordSchema as DomainReleaseRecordSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
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

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableNumberArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.Number)))

const ReleaseCategorySchema = Schema.Union([Schema.String, Schema.Number])
const ElapsedTimeSchema = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])))

const StatusApiSchema = Schema.Struct({
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

const HealthRecordApiSchema = Schema.Struct({
  source: NullableString,
  type: NullableString,
  message: Schema.String,
  wikiUrl: NullableString,
})

const IndexerRecordApiSchema = Schema.Struct({
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

const IndexerStatsRecordApiSchema = Schema.Struct({
  indexerId: Schema.Number,
  indexerName: Schema.String,
  numberOfQueries: NullableNumber,
  numberOfGrabs: NullableNumber,
  numberOfFailedQueries: NullableNumber,
  numberOfFailedGrabs: NullableNumber,
  averageResponseTime: NullableNumber,
})

const IndexerStatsResponseApiSchema = Schema.Struct({
  indexers: Schema.Array(IndexerStatsRecordApiSchema),
})

const ReleaseRecordApiSchema = Schema.Struct({
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
  categories: Schema.optional(Schema.NullOr(Schema.Array(ReleaseCategorySchema))),
})

const ApplicationRecordApiSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  implementation: NullableString,
  syncLevel: NullableString,
  tags: NullableNumberArray,
})

const CommandRecordApiSchema = Schema.Struct({
  id: NullableNumber,
  name: Schema.String,
  status: NullableString,
  queued: NullableString,
  started: NullableString,
  ended: NullableString,
})

const HistoryDataSchema = Schema.Struct({
  successful: NullableBoolean,
  query: NullableString,
  queryType: NullableString,
  results: NullableNumber,
  elapsedTime: ElapsedTimeSchema,
})

const HistoryRecordApiSchema = Schema.Struct({
  id: NullableNumber,
  date: NullableString,
  eventType: Schema.String,
  indexerId: NullableNumber,
  data: Schema.optional(Schema.NullOr(HistoryDataSchema)),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const sizeMB = (size: number | undefined): number | undefined =>
  size === undefined ? undefined : Math.floor(size / 1_048_576)

const systemStatusFromApi = (status: typeof StatusApiSchema.Type): SystemStatus => ({
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

const systemStatusToApi = (status: SystemStatus): typeof StatusApiSchema.Type => ({
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

export const StatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const healthRecordFromApi = (record: typeof HealthRecordApiSchema.Type): HealthRecord => ({
  source: fromNullable(record.source),
  type: fromNullable(record.type),
  message: record.message,
  wikiUrl: fromNullable(record.wikiUrl),
})

const healthRecordToApi = (record: HealthRecord): typeof HealthRecordApiSchema.Type => ({
  source: record.source,
  type: record.type,
  message: record.message,
  wikiUrl: record.wikiUrl,
})

export const HealthRecordSchema = HealthRecordApiSchema.pipe(
  Schema.decodeTo(DomainHealthRecordSchema, {
    decode: SchemaGetter.transform(healthRecordFromApi),
    encode: SchemaGetter.transform(healthRecordToApi),
  })
)

const indexerRecordFromApi = (record: typeof IndexerRecordApiSchema.Type): IndexerRecord => ({
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

const indexerRecordToApi = (record: IndexerRecord): typeof IndexerRecordApiSchema.Type => ({
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

export const IndexerRecordSchema = IndexerRecordApiSchema.pipe(
  Schema.decodeTo(DomainIndexerRecordSchema, {
    decode: SchemaGetter.transform(indexerRecordFromApi),
    encode: SchemaGetter.transform(indexerRecordToApi),
  })
)

const indexerStatsRecordFromApi = (record: typeof IndexerStatsRecordApiSchema.Type): IndexerStatsRecord => ({
  id: record.indexerId,
  name: record.indexerName,
  queries: fromNullable(record.numberOfQueries),
  grabs: fromNullable(record.numberOfGrabs),
  failedQueries: fromNullable(record.numberOfFailedQueries),
  failedGrabs: fromNullable(record.numberOfFailedGrabs),
  avgResponseTimeMs: fromNullable(record.averageResponseTime),
})

const indexerStatsRecordToApi = (record: IndexerStatsRecord): typeof IndexerStatsRecordApiSchema.Type => ({
  indexerId: record.id,
  indexerName: record.name,
  numberOfQueries: record.queries,
  numberOfGrabs: record.grabs,
  numberOfFailedQueries: record.failedQueries,
  numberOfFailedGrabs: record.failedGrabs,
  averageResponseTime: record.avgResponseTimeMs,
})

const releaseRecordFromApi = (record: typeof ReleaseRecordApiSchema.Type): ReleaseRecord => {
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

const releaseRecordToApi = (record: ReleaseRecord): typeof ReleaseRecordApiSchema.Type => ({
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

export const ReleaseRecordSchema = ReleaseRecordApiSchema.pipe(
  Schema.decodeTo(DomainReleaseRecordSchema, {
    decode: SchemaGetter.transform(releaseRecordFromApi),
    encode: SchemaGetter.transform(releaseRecordToApi),
  })
)

const applicationRecordFromApi = (record: typeof ApplicationRecordApiSchema.Type): ApplicationRecord => ({
  id: record.id,
  name: record.name,
  implementation: fromNullable(record.implementation),
  syncLevel: fromNullable(record.syncLevel),
  tags: fromNullable(record.tags),
})

const applicationRecordToApi = (record: ApplicationRecord): typeof ApplicationRecordApiSchema.Type => ({
  id: record.id,
  name: record.name,
  implementation: record.implementation,
  syncLevel: record.syncLevel,
  tags: record.tags,
})

export const ApplicationRecordSchema = ApplicationRecordApiSchema.pipe(
  Schema.decodeTo(DomainApplicationRecordSchema, {
    decode: SchemaGetter.transform(applicationRecordFromApi),
    encode: SchemaGetter.transform(applicationRecordToApi),
  })
)

const commandResultFromApi = (record: typeof CommandRecordApiSchema.Type): CommandResult => ({
  id: fromNullable(record.id),
  name: record.name,
  status: fromNullable(record.status),
  queued: fromNullable(record.queued),
  started: fromNullable(record.started),
  ended: fromNullable(record.ended),
})

const commandResultToApi = (record: CommandResult): typeof CommandRecordApiSchema.Type => ({
  id: record.id,
  name: record.name,
  status: record.status,
  queued: record.queued,
  started: record.started,
  ended: record.ended,
})

export const CommandRecordSchema = CommandRecordApiSchema.pipe(
  Schema.decodeTo(DomainCommandResultSchema, {
    decode: SchemaGetter.transform(commandResultFromApi),
    encode: SchemaGetter.transform(commandResultToApi),
  })
)

const historyRecordFromApi = (record: typeof HistoryRecordApiSchema.Type): HistoryRecord => ({
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

const historyRecordToApi = (record: HistoryRecord): typeof HistoryRecordApiSchema.Type => ({
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

const HistoryRecordSchema = HistoryRecordApiSchema.pipe(
  Schema.decodeTo(DomainHistoryRecordSchema, {
    decode: SchemaGetter.transform(historyRecordFromApi),
    encode: SchemaGetter.transform(historyRecordToApi),
  })
)

export const IndexerStatsResponseSchema = IndexerStatsResponseApiSchema.pipe(
  Schema.decodeTo(Schema.Array(DomainIndexerStatsRecordSchema), {
    decode: SchemaGetter.transform((response: typeof IndexerStatsResponseApiSchema.Type) =>
      response.indexers.map(indexerStatsRecordFromApi)
    ),
    encode: SchemaGetter.transform((records: ReadonlyArray<IndexerStatsRecord>) => ({
      indexers: records.map(indexerStatsRecordToApi),
    })),
  })
)

const HistoryResponseApiSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

const historyResponseFromApi = (response: typeof HistoryResponseApiSchema.Type): ListResult<HistoryRecord> => ({
  count: response.records.length,
  totalRecords: fromNullable(response.totalRecords) ?? response.records.length,
  records: response.records,
})

const historyResponseToApi = (result: ListResult<HistoryRecord>): typeof HistoryResponseApiSchema.Type => ({
  totalRecords: result.totalRecords,
  records: result.records,
})

export const HistoryResponseSchema = HistoryResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainHistoryRecordSchema), {
    decode: SchemaGetter.transform(historyResponseFromApi),
    encode: SchemaGetter.transform(historyResponseToApi),
  })
)
