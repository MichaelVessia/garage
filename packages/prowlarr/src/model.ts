import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const ProwlarrConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type ProwlarrConfigValue = typeof ProwlarrConfigValue.Type

export const SystemStatus = Schema.Struct({
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
export type SystemStatus = typeof SystemStatus.Type

export const HealthRecord = Schema.Struct({
  source: OptionalString,
  type: OptionalString,
  message: Schema.String,
  wikiUrl: OptionalString,
})
export type HealthRecord = typeof HealthRecord.Type

export const IndexerRecord = Schema.Struct({
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
export type IndexerRecord = typeof IndexerRecord.Type

export const IndexerStatsRecord = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  queries: OptionalNumber,
  grabs: OptionalNumber,
  failedQueries: OptionalNumber,
  failedGrabs: OptionalNumber,
  avgResponseTimeMs: OptionalNumber,
})
export type IndexerStatsRecord = typeof IndexerStatsRecord.Type

export const SearchProtocol = Schema.Literals(['torrent', 'usenet'])
export type SearchProtocol = typeof SearchProtocol.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  protocol: Schema.optional(SearchProtocol),
  category: OptionalNumber,
  type: OptionalString,
})
export type SearchOptions = typeof SearchOptions.Type

export const TvSearchOptions = Schema.Struct({
  tvdbId: Schema.Number,
  season: OptionalNumber,
  episode: OptionalNumber,
  limit: Schema.Number,
})
export type TvSearchOptions = typeof TvSearchOptions.Type

export const MovieSearchOptions = Schema.Struct({
  imdbId: OptionalString,
  tmdbId: OptionalNumber,
  limit: Schema.Number,
})
export type MovieSearchOptions = typeof MovieSearchOptions.Type

export const ReleaseRecord = Schema.Struct({
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
  categories: Schema.Array(Schema.Union([Schema.String, Schema.Number])).pipe(Schema.optional),
})
export type ReleaseRecord = typeof ReleaseRecord.Type

export const ApplicationRecord = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  implementation: OptionalString,
  syncLevel: OptionalString,
  tags: Schema.Array(Schema.Number).pipe(Schema.optional),
})
export type ApplicationRecord = typeof ApplicationRecord.Type

export const CommandResult = Schema.Struct({
  id: OptionalNumber,
  name: Schema.String,
  status: OptionalString,
  queued: OptionalString,
  started: OptionalString,
  ended: OptionalString,
})
export type CommandResult = typeof CommandResult.Type

export const IndexerTestResult = Schema.Struct({
  indexerId: Schema.Number,
  passed: Schema.Boolean,
  httpStatus: Schema.Number,
})
export type IndexerTestResult = typeof IndexerTestResult.Type

export const HistoryRecord = Schema.Struct({
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
export type HistoryRecord = typeof HistoryRecord.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const SearchResult = Schema.Struct({
  query: Schema.String,
  type: Schema.String,
  count: Schema.Number,
  totalRecords: Schema.Number,
  records: Schema.Array(ReleaseRecord),
})
export type SearchResult = typeof SearchResult.Type
