import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObject.Type

export const TubearchivistConfigValue = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type TubearchivistConfigValue = typeof TubearchivistConfigValue.Type

export const SessionCookies = Schema.Struct({
  sessionId: Schema.String,
  csrfToken: Schema.String,
})
export type SessionCookies = typeof SessionCookies.Type

const StatusStats = Schema.Struct({
  video: JsonObject,
  channel: JsonObject,
  download: JsonObject,
  watch: JsonObject,
})

export const StatusResult = Schema.Struct({
  url: Schema.String,
  health: OptionalString,
  config: JsonObject,
  stats: StatusStats,
})
export type StatusResult = typeof StatusResult.Type

export const ChannelRecord = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  subscribed: OptionalBoolean,
  active: OptionalBoolean,
  lastRefresh: OptionalString,
})
export type ChannelRecord = typeof ChannelRecord.Type

export const VideoRecord = Schema.Struct({
  youtubeId: Schema.String,
  title: OptionalString,
  channel: OptionalString,
  published: OptionalString,
  videoType: OptionalString,
  watched: OptionalBoolean,
})
export type VideoRecord = typeof VideoRecord.Type

export const DownloadRecord = Schema.Struct({
  youtubeId: Schema.String,
  title: OptionalString,
  channel: OptionalString,
  status: OptionalString,
  videoType: OptionalString,
})
export type DownloadRecord = typeof DownloadRecord.Type

export const PlaylistRecord = Schema.Struct({
  playlistId: Schema.String,
  name: OptionalString,
  channel: OptionalString,
  subscribed: OptionalBoolean,
  entries: OptionalNumber,
})
export type PlaylistRecord = typeof PlaylistRecord.Type

export const TaskRecord = Schema.Struct({
  name: OptionalString,
  status: OptionalString,
  dateDone: OptionalString,
  args: Schema.Array(Schema.Unknown).pipe(Schema.optional),
  kwargs: Schema.optional(JsonObject),
  taskId: OptionalString,
  error: Schema.optional(Schema.Unknown),
})
export type TaskRecord = typeof TaskRecord.Type

export const ListResult = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    total: OptionalNumber,
    records: Schema.Array(record),
    moreAvailable: OptionalBoolean,
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>

export const SearchResult = Schema.Struct({
  queryType: OptionalString,
  query: Schema.String,
  videos: ListResult(VideoRecord),
  channels: ListResult(ChannelRecord),
  playlists: ListResult(PlaylistRecord),
})
export type SearchResult = typeof SearchResult.Type

export const SubscriptionResult = Schema.Struct({
  target: Schema.String,
  subscribed: Schema.Boolean,
  response: JsonObject,
  note: OptionalString,
})
export type SubscriptionResult = typeof SubscriptionResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const IdOptions = Schema.Struct({ id: Schema.String })
export type IdOptions = typeof IdOptions.Type

export const SubscriptionOptions = Schema.Struct({ target: Schema.String })
export type SubscriptionOptions = typeof SubscriptionOptions.Type
