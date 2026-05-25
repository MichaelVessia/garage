import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObjectSchema.Type

export const TubearchivistConfigValueSchema = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type TubearchivistConfigValue = typeof TubearchivistConfigValueSchema.Type

export const SessionCookiesSchema = Schema.Struct({
  sessionId: Schema.String,
  csrfToken: Schema.String,
})
export type SessionCookies = typeof SessionCookiesSchema.Type

const StatusStatsSchema = Schema.Struct({
  video: JsonObjectSchema,
  channel: JsonObjectSchema,
  download: JsonObjectSchema,
  watch: JsonObjectSchema,
})

export const StatusResultSchema = Schema.Struct({
  url: Schema.String,
  health: OptionalString,
  config: JsonObjectSchema,
  stats: StatusStatsSchema,
})
export type StatusResult = typeof StatusResultSchema.Type

export const ChannelRecordSchema = Schema.Struct({
  id: Schema.String,
  name: OptionalString,
  subscribed: OptionalBoolean,
  active: OptionalBoolean,
  lastRefresh: OptionalString,
})
export type ChannelRecord = typeof ChannelRecordSchema.Type

export const VideoRecordSchema = Schema.Struct({
  youtubeId: Schema.String,
  title: OptionalString,
  channel: OptionalString,
  published: OptionalString,
  videoType: OptionalString,
  watched: OptionalBoolean,
})
export type VideoRecord = typeof VideoRecordSchema.Type

export const DownloadRecordSchema = Schema.Struct({
  youtubeId: Schema.String,
  title: OptionalString,
  channel: OptionalString,
  status: OptionalString,
  videoType: OptionalString,
})
export type DownloadRecord = typeof DownloadRecordSchema.Type

export const PlaylistRecordSchema = Schema.Struct({
  playlistId: Schema.String,
  name: OptionalString,
  channel: OptionalString,
  subscribed: OptionalBoolean,
  entries: OptionalNumber,
})
export type PlaylistRecord = typeof PlaylistRecordSchema.Type

export const TaskRecordSchema = Schema.Struct({
  name: OptionalString,
  status: OptionalString,
  dateDone: OptionalString,
  args: Schema.optional(Schema.Array(Schema.Unknown)),
  kwargs: Schema.optional(JsonObjectSchema),
  taskId: OptionalString,
  error: Schema.optional(Schema.Unknown),
})
export type TaskRecord = typeof TaskRecordSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    total: OptionalNumber,
    records: Schema.Array(record),
    moreAvailable: OptionalBoolean,
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const SearchResultSchema = Schema.Struct({
  queryType: OptionalString,
  query: Schema.String,
  videos: ListResultSchema(VideoRecordSchema),
  channels: ListResultSchema(ChannelRecordSchema),
  playlists: ListResultSchema(PlaylistRecordSchema),
})
export type SearchResult = typeof SearchResultSchema.Type

export const SubscriptionResultSchema = Schema.Struct({
  target: Schema.String,
  subscribed: Schema.Boolean,
  response: JsonObjectSchema,
  note: OptionalString,
})
export type SubscriptionResult = typeof SubscriptionResultSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const IdOptionsSchema = Schema.Struct({ id: Schema.String })
export type IdOptions = typeof IdOptionsSchema.Type

export const SubscriptionOptionsSchema = Schema.Struct({ target: Schema.String })
export type SubscriptionOptions = typeof SubscriptionOptionsSchema.Type
