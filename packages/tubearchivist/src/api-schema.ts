import { Schema } from 'effect'

import type {
  ChannelRecord,
  DownloadRecord,
  JsonObject,
  ListResult,
  PlaylistRecord,
  SearchResult,
  TaskRecord,
  VideoRecord,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

const PaginateSchema = Schema.Struct({
  total_hits: NullableNumber,
  page_size: NullableNumber,
})

const ChannelSummarySchema = Schema.Struct({
  channel_id: Schema.String,
  channel_name: NullableString,
  channel_subscribed: NullableBoolean,
  channel_active: NullableBoolean,
  channel_last_refresh: NullableString,
})

const VideoChannelSchema = Schema.Struct({
  channel_name: NullableString,
})

const PlayerSchema = Schema.Struct({
  watched: NullableBoolean,
})

const VideoSchema = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel: Schema.optional(Schema.NullOr(VideoChannelSchema)),
  published: NullableString,
  vid_type: NullableString,
  player: Schema.optional(Schema.NullOr(PlayerSchema)),
})

const DownloadSchema = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel_name: NullableString,
  status: NullableString,
  vid_type: NullableString,
})

const PlaylistSchema = Schema.Struct({
  playlist_id: Schema.String,
  playlist_name: NullableString,
  playlist_channel: NullableString,
  playlist_subscribed: NullableBoolean,
  playlist_entries: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
})

const TaskSchema = Schema.Struct({
  name: NullableString,
  status: NullableString,
  date_done: NullableString,
  args: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
  kwargs: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  task_id: NullableString,
  result: Schema.optional(Schema.Unknown),
})

export const ChannelResponseSchema = Schema.Struct({
  data: Schema.Array(ChannelSummarySchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

export const VideoResponseSchema = Schema.Struct({
  data: Schema.Array(VideoSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

export const DownloadResponseSchema = Schema.Struct({
  data: Schema.Array(DownloadSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

export const PlaylistResponseSchema = Schema.Struct({
  data: Schema.Array(PlaylistSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

export const ChannelDetailSchema = ChannelSummarySchema
export const VideoDetailSchema = VideoSchema
export const TasksSchema = Schema.Array(TaskSchema)

export const SearchResponseSchema = Schema.Struct({
  queryType: NullableString,
  results: Schema.Struct({
    video_results: Schema.optional(Schema.NullOr(Schema.Array(VideoSchema))),
    channel_results: Schema.optional(Schema.NullOr(Schema.Array(ChannelSummarySchema))),
    playlist_results: Schema.optional(Schema.NullOr(Schema.Array(PlaylistSchema))),
  }),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const paginateTotal = (paginate: typeof PaginateSchema.Type | null | undefined): number | undefined =>
  paginate === null || paginate === undefined ? undefined : fromNullable(paginate.total_hits)

const listResult = <Record>(
  records: ReadonlyArray<Record>,
  limit: number,
  total?: number | undefined
): ListResult<Record> => {
  const limited = records.slice(0, limit)
  return {
    count: limited.length,
    total,
    records: limited,
    moreAvailable: total === undefined ? records.length > limited.length : total > limited.length,
  }
}

export const toJsonObject = (value: typeof JsonObjectSchema.Type): JsonObject => value

export const toChannel = (channel: typeof ChannelSummarySchema.Type): ChannelRecord => ({
  id: channel.channel_id,
  name: fromNullable(channel.channel_name),
  subscribed: fromNullable(channel.channel_subscribed),
  active: fromNullable(channel.channel_active),
  lastRefresh: fromNullable(channel.channel_last_refresh),
})

export const toVideo = (video: typeof VideoSchema.Type): VideoRecord => ({
  youtubeId: video.youtube_id,
  title: fromNullable(video.title),
  channel: video.channel === null || video.channel === undefined ? undefined : fromNullable(video.channel.channel_name),
  published: fromNullable(video.published),
  videoType: fromNullable(video.vid_type),
  watched: video.player === null || video.player === undefined ? undefined : fromNullable(video.player.watched),
})

export const toDownload = (download: typeof DownloadSchema.Type): DownloadRecord => ({
  youtubeId: download.youtube_id,
  title: fromNullable(download.title),
  channel: fromNullable(download.channel_name),
  status: fromNullable(download.status),
  videoType: fromNullable(download.vid_type),
})

export const toPlaylist = (playlist: typeof PlaylistSchema.Type): PlaylistRecord => ({
  playlistId: playlist.playlist_id,
  name: fromNullable(playlist.playlist_name),
  channel: fromNullable(playlist.playlist_channel),
  subscribed: fromNullable(playlist.playlist_subscribed),
  entries:
    playlist.playlist_entries === null || playlist.playlist_entries === undefined
      ? undefined
      : playlist.playlist_entries.length,
})

export const toTask = (task: typeof TaskSchema.Type): TaskRecord => ({
  name: fromNullable(task.name),
  status: fromNullable(task.status),
  dateDone: fromNullable(task.date_done),
  args: fromNullable(task.args),
  kwargs: fromNullable(task.kwargs),
  taskId: fromNullable(task.task_id),
  error: task.status === 'FAILURE' ? task.result : undefined,
})

export const toChannelList = (response: typeof ChannelResponseSchema.Type, limit: number): ListResult<ChannelRecord> =>
  listResult(response.data.map(toChannel), limit, paginateTotal(response.paginate))

export const toVideoList = (response: typeof VideoResponseSchema.Type, limit: number): ListResult<VideoRecord> =>
  listResult(response.data.map(toVideo), limit, paginateTotal(response.paginate))

export const toDownloadList = (
  response: typeof DownloadResponseSchema.Type,
  limit: number
): ListResult<DownloadRecord> => listResult(response.data.map(toDownload), limit, paginateTotal(response.paginate))

export const toPlaylistList = (
  response: typeof PlaylistResponseSchema.Type,
  limit: number
): ListResult<PlaylistRecord> => listResult(response.data.map(toPlaylist), limit, paginateTotal(response.paginate))

export const toTaskList = (tasks: typeof TasksSchema.Type, limit: number): ListResult<TaskRecord> =>
  listResult(tasks.map(toTask), limit)

export const toSearchResult = (
  query: string,
  response: typeof SearchResponseSchema.Type,
  limit: number
): SearchResult => ({
  query,
  queryType: fromNullable(response.queryType),
  videos: listResult((response.results.video_results ?? []).map(toVideo), limit),
  channels: listResult((response.results.channel_results ?? []).map(toChannel), limit),
  playlists: listResult((response.results.playlist_results ?? []).map(toPlaylist), limit),
})
