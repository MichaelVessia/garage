import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const JellyfinConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type JellyfinConfigValue = typeof JellyfinConfigValue.Type

export const SystemStatus = Schema.Struct({
  serverName: OptionalString,
  version: OptionalString,
  id: OptionalString,
  operatingSystem: OptionalString,
  productName: OptionalString,
  localAddress: OptionalString,
})
export type SystemStatus = typeof SystemStatus.Type

export const UserRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  lastActivityDate: OptionalString,
  isAdministrator: OptionalBoolean,
  isDisabled: OptionalBoolean,
})
export type UserRecord = typeof UserRecord.Type

export const LibraryRecord = Schema.Struct({
  name: OptionalString,
  collectionType: OptionalString,
  itemId: OptionalString,
  locations: OptionalStringArray,
})
export type LibraryRecord = typeof LibraryRecord.Type

export const SessionRecord = Schema.Struct({
  sessionId: OptionalString,
  user: OptionalString,
  client: OptionalString,
  device: OptionalString,
  appVersion: OptionalString,
  lastActivityDate: OptionalString,
  nowPlaying: OptionalString,
  playMethod: OptionalString,
})
export type SessionRecord = typeof SessionRecord.Type

export const NowPlayingRecord = Schema.Struct({
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
export type NowPlayingRecord = typeof NowPlayingRecord.Type

export const ItemRecord = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: OptionalString,
  series: OptionalString,
  season: OptionalNumber,
  episode: OptionalNumber,
  dateCreated: OptionalString,
  productionYear: OptionalNumber,
})
export type ItemRecord = typeof ItemRecord.Type

export const LibraryStats = Schema.Record(Schema.String, Schema.Number)
export type LibraryStats = typeof LibraryStats.Type

export const ScheduledTaskRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  state: OptionalString,
  lastExecutionResult: OptionalString,
  lastEndTime: OptionalString,
  category: OptionalString,
})
export type ScheduledTaskRecord = typeof ScheduledTaskRecord.Type

export const RunTaskResult = Schema.Struct({
  started: Schema.Boolean,
  taskId: Schema.String,
  httpStatus: Schema.Number,
})
export type RunTaskResult = typeof RunTaskResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>
