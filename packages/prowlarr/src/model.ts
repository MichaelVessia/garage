import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const ProwlarrConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type ProwlarrConfigValue = typeof ProwlarrConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  appName: OptionalString,
  version: Schema.String,
  instanceName: OptionalString,
  branch: OptionalString,
  runtimeVersion: OptionalString,
  osName: OptionalString,
  osVersion: OptionalString,
  buildTime: OptionalString,
  isLinux: OptionalBoolean,
  isProduction: OptionalBoolean,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const HealthRecordSchema = Schema.Struct({
  source: OptionalString,
  type: OptionalString,
  message: Schema.String,
  wikiUrl: OptionalString,
})
export type HealthRecord = typeof HealthRecordSchema.Type

export const IndexerRecordSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  protocol: OptionalString,
  enabled: OptionalBoolean,
  priority: OptionalNumber,
  supportsSearch: OptionalBoolean,
  supportsRss: OptionalBoolean,
  implementation: OptionalString,
  implementationName: OptionalString,
})
export type IndexerRecord = typeof IndexerRecordSchema.Type

export const IndexerStatsRecordSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  queries: OptionalNumber,
  grabs: OptionalNumber,
  failedQueries: OptionalNumber,
  failedGrabs: OptionalNumber,
  avgResponseTimeMs: OptionalNumber,
})
export type IndexerStatsRecord = typeof IndexerStatsRecordSchema.Type

export const SearchProtocolSchema = Schema.Literals(['torrent', 'usenet'])
export type SearchProtocol = typeof SearchProtocolSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  protocol: Schema.optional(SearchProtocolSchema),
  category: OptionalNumber,
  type: OptionalString,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const TvSearchOptionsSchema = Schema.Struct({
  tvdbId: Schema.Number,
  season: OptionalNumber,
  episode: OptionalNumber,
  limit: Schema.Number,
})
export type TvSearchOptions = typeof TvSearchOptionsSchema.Type

export const MovieSearchOptionsSchema = Schema.Struct({
  imdbId: OptionalString,
  tmdbId: OptionalNumber,
  limit: Schema.Number,
})
export type MovieSearchOptions = typeof MovieSearchOptionsSchema.Type

export const ReleaseRecordSchema = Schema.Struct({
  guid: OptionalString,
  indexerId: OptionalNumber,
  indexer: OptionalString,
  title: Schema.String,
  protocol: OptionalString,
  size: OptionalNumber,
  sizeMB: OptionalNumber,
  seeders: OptionalNumber,
  leechers: OptionalNumber,
  grabs: OptionalNumber,
  age: OptionalNumber,
  publishDate: OptionalString,
  downloadUrl: OptionalString,
  infoUrl: OptionalString,
  categories: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number]))),
})
export type ReleaseRecord = typeof ReleaseRecordSchema.Type

export const ApplicationRecordSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  implementation: OptionalString,
  syncLevel: OptionalString,
  tags: Schema.optional(Schema.Array(Schema.Number)),
})
export type ApplicationRecord = typeof ApplicationRecordSchema.Type

export const CommandResultSchema = Schema.Struct({
  id: OptionalNumber,
  name: Schema.String,
  status: OptionalString,
  queued: OptionalString,
  started: OptionalString,
  ended: OptionalString,
})
export type CommandResult = typeof CommandResultSchema.Type

export const IndexerTestResultSchema = Schema.Struct({
  indexerId: Schema.Number,
  passed: Schema.Boolean,
  httpStatus: Schema.Number,
})
export type IndexerTestResult = typeof IndexerTestResultSchema.Type

export const HistoryRecordSchema = Schema.Struct({
  id: OptionalNumber,
  date: OptionalString,
  eventType: Schema.String,
  indexerId: OptionalNumber,
  successful: OptionalBoolean,
  query: OptionalString,
  queryType: OptionalString,
  results: OptionalNumber,
  elapsedTime: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
})
export type HistoryRecord = typeof HistoryRecordSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const SearchResultSchema = Schema.Struct({
  query: Schema.String,
  type: Schema.String,
  count: Schema.Number,
  totalRecords: Schema.Number,
  records: Schema.Array(ReleaseRecordSchema),
})
export type SearchResult = typeof SearchResultSchema.Type
