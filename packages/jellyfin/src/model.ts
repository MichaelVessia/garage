import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const JellyfinConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.String,
})
export type JellyfinConfigValue = typeof JellyfinConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  serverName: OptionalString,
  version: OptionalString,
  id: OptionalString,
  operatingSystem: OptionalString,
  productName: OptionalString,
  localAddress: OptionalString,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const UserRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  lastActivityDate: OptionalString,
  isAdministrator: OptionalBoolean,
  isDisabled: OptionalBoolean,
})
export type UserRecord = typeof UserRecordSchema.Type

export const LibraryRecordSchema = Schema.Struct({
  name: OptionalString,
  collectionType: OptionalString,
  itemId: OptionalString,
  locations: OptionalStringArray,
})
export type LibraryRecord = typeof LibraryRecordSchema.Type

export const SessionRecordSchema = Schema.Struct({
  sessionId: OptionalString,
  user: OptionalString,
  client: OptionalString,
  device: OptionalString,
  appVersion: OptionalString,
  lastActivityDate: OptionalString,
  nowPlaying: OptionalString,
  playMethod: OptionalString,
})
export type SessionRecord = typeof SessionRecordSchema.Type

export const NowPlayingRecordSchema = Schema.Struct({
  user: OptionalString,
  device: OptionalString,
  client: OptionalString,
  item: Schema.String,
  type: OptionalString,
  series: OptionalString,
  season: OptionalNumber,
  episode: OptionalNumber,
  positionTicks: OptionalNumber,
  runtimeTicks: OptionalNumber,
  isPaused: OptionalBoolean,
  playMethod: OptionalString,
})
export type NowPlayingRecord = typeof NowPlayingRecordSchema.Type

export const ItemRecordSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: OptionalString,
  series: OptionalString,
  season: OptionalNumber,
  episode: OptionalNumber,
  dateCreated: OptionalString,
  productionYear: OptionalNumber,
})
export type ItemRecord = typeof ItemRecordSchema.Type

export const LibraryStatsSchema = Schema.Record(Schema.String, Schema.Number)
export type LibraryStats = typeof LibraryStatsSchema.Type

export const ScheduledTaskRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  state: OptionalString,
  lastExecutionResult: OptionalString,
  lastEndTime: OptionalString,
  category: OptionalString,
})
export type ScheduledTaskRecord = typeof ScheduledTaskRecordSchema.Type

export const RunTaskResultSchema = Schema.Struct({
  started: Schema.Boolean,
  taskId: Schema.String,
  httpStatus: Schema.Number,
})
export type RunTaskResult = typeof RunTaskResultSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>
