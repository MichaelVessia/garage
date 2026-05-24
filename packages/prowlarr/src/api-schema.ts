import { Schema } from 'effect'

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

export const StatusSchema = Schema.Struct({
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

export const HealthRecordSchema = Schema.Struct({
  source: NullableString,
  type: NullableString,
  message: Schema.String,
  wikiUrl: NullableString,
})

export const IndexerRecordSchema = Schema.Struct({
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

const IndexerStatsRecordSchema = Schema.Struct({
  indexerId: Schema.Number,
  indexerName: Schema.String,
  numberOfQueries: NullableNumber,
  numberOfGrabs: NullableNumber,
  numberOfFailedQueries: NullableNumber,
  numberOfFailedGrabs: NullableNumber,
  averageResponseTime: NullableNumber,
})

export const IndexerStatsResponseSchema = Schema.Struct({
  indexers: Schema.Array(IndexerStatsRecordSchema),
})

export const ReleaseRecordSchema = Schema.Struct({
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

export const ApplicationRecordSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  implementation: NullableString,
  syncLevel: NullableString,
  tags: NullableNumberArray,
})

export const CommandRecordSchema = Schema.Struct({
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

const HistoryRecordSchema = Schema.Struct({
  id: NullableNumber,
  date: NullableString,
  eventType: Schema.String,
  indexerId: NullableNumber,
  data: Schema.optional(Schema.NullOr(HistoryDataSchema)),
})

export const HistoryResponseSchema = Schema.Struct({
  totalRecords: NullableNumber,
  records: Schema.Array(HistoryRecordSchema),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const sizeMB = (size: number | undefined): number | undefined =>
  size === undefined ? undefined : Math.floor(size / 1_048_576)

export const toSystemStatus = (status: typeof StatusSchema.Type): SystemStatus => ({
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

export const toHealthRecord = (record: typeof HealthRecordSchema.Type): HealthRecord => ({
  source: fromNullable(record.source),
  type: fromNullable(record.type),
  message: record.message,
  wikiUrl: fromNullable(record.wikiUrl),
})

export const toIndexerRecord = (record: typeof IndexerRecordSchema.Type): IndexerRecord => ({
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

export const toIndexerStatsRecord = (record: typeof IndexerStatsRecordSchema.Type): IndexerStatsRecord => ({
  id: record.indexerId,
  name: record.indexerName,
  queries: fromNullable(record.numberOfQueries),
  grabs: fromNullable(record.numberOfGrabs),
  failedQueries: fromNullable(record.numberOfFailedQueries),
  failedGrabs: fromNullable(record.numberOfFailedGrabs),
  avgResponseTimeMs: fromNullable(record.averageResponseTime),
})

export const toReleaseRecord = (record: typeof ReleaseRecordSchema.Type): ReleaseRecord => {
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

export const toApplicationRecord = (record: typeof ApplicationRecordSchema.Type): ApplicationRecord => ({
  id: record.id,
  name: record.name,
  implementation: fromNullable(record.implementation),
  syncLevel: fromNullable(record.syncLevel),
  tags: fromNullable(record.tags),
})

export const toCommandResult = (record: typeof CommandRecordSchema.Type): CommandResult => ({
  id: fromNullable(record.id),
  name: record.name,
  status: fromNullable(record.status),
  queued: fromNullable(record.queued),
  started: fromNullable(record.started),
  ended: fromNullable(record.ended),
})

export const toHistoryRecord = (record: typeof HistoryRecordSchema.Type): HistoryRecord => ({
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

export const toListResult = <Record>(
  response: { readonly totalRecords?: number | null | undefined; readonly records: ReadonlyArray<unknown> },
  records: ReadonlyArray<Record>
): ListResult<Record> => ({
  count: records.length,
  totalRecords: fromNullable(response.totalRecords) ?? records.length,
  records,
})
