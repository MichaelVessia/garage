import { Schema, SchemaGetter } from 'effect'

import {
  ChannelRecordSchema as DomainChannelRecordSchema,
  DownloadRecordSchema as DomainDownloadRecordSchema,
  ListResultSchema as DomainListResultSchema,
  PlaylistRecordSchema as DomainPlaylistRecordSchema,
  SearchResultSchema as DomainSearchResultSchema,
  TaskRecordSchema as DomainTaskRecordSchema,
  VideoRecordSchema as DomainVideoRecordSchema,
} from './model.js'
import type {
  ChannelRecord,
  DownloadRecord,
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

const ChannelApiSchema = Schema.Struct({
  channel_id: Schema.String,
  channel_name: NullableString,
  channel_subscribed: NullableBoolean,
  channel_active: NullableBoolean,
  channel_last_refresh: NullableString,
})

const VideoChannelSchema = Schema.Struct({ channel_name: NullableString })
const PlayerSchema = Schema.Struct({ watched: NullableBoolean })

const VideoApiSchema = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel: Schema.optional(Schema.NullOr(VideoChannelSchema)),
  published: NullableString,
  vid_type: NullableString,
  player: Schema.optional(Schema.NullOr(PlayerSchema)),
})

const DownloadApiSchema = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel_name: NullableString,
  status: NullableString,
  vid_type: NullableString,
})

const PlaylistApiSchema = Schema.Struct({
  playlist_id: Schema.String,
  playlist_name: NullableString,
  playlist_channel: NullableString,
  playlist_subscribed: NullableBoolean,
  playlist_entries: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
})

const TaskApiSchema = Schema.Struct({
  name: NullableString,
  status: NullableString,
  date_done: NullableString,
  args: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
  kwargs: Schema.optional(Schema.NullOr(JsonObjectSchema)),
  task_id: NullableString,
  result: Schema.optional(Schema.Unknown),
})

const ChannelResponseApiSchema = Schema.Struct({
  data: Schema.Array(ChannelApiSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

const VideoResponseApiSchema = Schema.Struct({
  data: Schema.Array(VideoApiSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

const DownloadResponseApiSchema = Schema.Struct({
  data: Schema.Array(DownloadApiSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

const PlaylistResponseApiSchema = Schema.Struct({
  data: Schema.Array(PlaylistApiSchema),
  paginate: Schema.optional(Schema.NullOr(PaginateSchema)),
})

const TasksApiSchema = Schema.Array(TaskApiSchema)

const SearchResponseApiSchema = Schema.Struct({
  queryType: NullableString,
  results: Schema.Struct({
    video_results: Schema.optional(Schema.NullOr(Schema.Array(VideoApiSchema))),
    channel_results: Schema.optional(Schema.NullOr(Schema.Array(ChannelApiSchema))),
    playlist_results: Schema.optional(Schema.NullOr(Schema.Array(PlaylistApiSchema))),
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

const channelFromApi = (channel: typeof ChannelApiSchema.Type): ChannelRecord => ({
  id: channel.channel_id,
  name: fromNullable(channel.channel_name),
  subscribed: fromNullable(channel.channel_subscribed),
  active: fromNullable(channel.channel_active),
  lastRefresh: fromNullable(channel.channel_last_refresh),
})

const channelToApi = (channel: ChannelRecord): typeof ChannelApiSchema.Type => ({
  channel_id: channel.id,
  channel_name: channel.name,
  channel_subscribed: channel.subscribed,
  channel_active: channel.active,
  channel_last_refresh: channel.lastRefresh,
})

export const ChannelDetailSchema = ChannelApiSchema.pipe(
  Schema.decodeTo(DomainChannelRecordSchema, {
    decode: SchemaGetter.transform(channelFromApi),
    encode: SchemaGetter.transform(channelToApi),
  })
)

const videoFromApi = (video: typeof VideoApiSchema.Type): VideoRecord => ({
  youtubeId: video.youtube_id,
  title: fromNullable(video.title),
  channel: video.channel === null || video.channel === undefined ? undefined : fromNullable(video.channel.channel_name),
  published: fromNullable(video.published),
  videoType: fromNullable(video.vid_type),
  watched: video.player === null || video.player === undefined ? undefined : fromNullable(video.player.watched),
})

const videoToApi = (video: VideoRecord): typeof VideoApiSchema.Type => ({
  youtube_id: video.youtubeId,
  title: video.title,
  channel: video.channel === undefined ? undefined : { channel_name: video.channel },
  published: video.published,
  vid_type: video.videoType,
  player: { watched: video.watched },
})

export const VideoDetailSchema = VideoApiSchema.pipe(
  Schema.decodeTo(DomainVideoRecordSchema, {
    decode: SchemaGetter.transform(videoFromApi),
    encode: SchemaGetter.transform(videoToApi),
  })
)

const downloadFromApi = (download: typeof DownloadApiSchema.Type): DownloadRecord => ({
  youtubeId: download.youtube_id,
  title: fromNullable(download.title),
  channel: fromNullable(download.channel_name),
  status: fromNullable(download.status),
  videoType: fromNullable(download.vid_type),
})

const downloadToApi = (download: DownloadRecord): typeof DownloadApiSchema.Type => ({
  youtube_id: download.youtubeId,
  title: download.title,
  channel_name: download.channel,
  status: download.status,
  vid_type: download.videoType,
})

const playlistFromApi = (playlist: typeof PlaylistApiSchema.Type): PlaylistRecord => ({
  playlistId: playlist.playlist_id,
  name: fromNullable(playlist.playlist_name),
  channel: fromNullable(playlist.playlist_channel),
  subscribed: fromNullable(playlist.playlist_subscribed),
  entries:
    playlist.playlist_entries === null || playlist.playlist_entries === undefined
      ? undefined
      : playlist.playlist_entries.length,
})

const playlistToApi = (playlist: PlaylistRecord): typeof PlaylistApiSchema.Type => ({
  playlist_id: playlist.playlistId,
  playlist_name: playlist.name,
  playlist_channel: playlist.channel,
  playlist_subscribed: playlist.subscribed,
})

const taskFromApi = (task: typeof TaskApiSchema.Type): TaskRecord => ({
  name: fromNullable(task.name),
  status: fromNullable(task.status),
  dateDone: fromNullable(task.date_done),
  args: fromNullable(task.args),
  kwargs: fromNullable(task.kwargs),
  taskId: fromNullable(task.task_id),
  error: task.status === 'FAILURE' ? task.result : undefined,
})

const taskToApi = (task: TaskRecord): typeof TaskApiSchema.Type => ({
  name: task.name,
  status: task.status,
  date_done: task.dateDone,
  args: task.args,
  kwargs: task.kwargs,
  task_id: task.taskId,
  result: task.error,
})

const listResponse = <ApiRecord, DomainRecord>(
  records: ReadonlyArray<ApiRecord>,
  limit: number,
  mapper: (record: ApiRecord) => DomainRecord,
  total?: number | undefined
): ListResult<DomainRecord> => listResult(records.map(mapper), limit, total)

export const ChannelResponseSchema = (limit: number) =>
  ChannelResponseApiSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainChannelRecordSchema), {
      decode: SchemaGetter.transform((response: typeof ChannelResponseApiSchema.Type) =>
        listResponse(response.data, limit, channelFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<ChannelRecord>) => ({
        data: result.records.map(channelToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const VideoResponseSchema = (limit: number) =>
  VideoResponseApiSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainVideoRecordSchema), {
      decode: SchemaGetter.transform((response: typeof VideoResponseApiSchema.Type) =>
        listResponse(response.data, limit, videoFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<VideoRecord>) => ({
        data: result.records.map(videoToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const DownloadResponseSchema = (limit: number) =>
  DownloadResponseApiSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainDownloadRecordSchema), {
      decode: SchemaGetter.transform((response: typeof DownloadResponseApiSchema.Type) =>
        listResponse(response.data, limit, downloadFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<DownloadRecord>) => ({
        data: result.records.map(downloadToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const PlaylistResponseSchema = (limit: number) =>
  PlaylistResponseApiSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainPlaylistRecordSchema), {
      decode: SchemaGetter.transform((response: typeof PlaylistResponseApiSchema.Type) =>
        listResponse(response.data, limit, playlistFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<PlaylistRecord>) => ({
        data: result.records.map(playlistToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const TasksSchema = (limit: number) =>
  TasksApiSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainTaskRecordSchema), {
      decode: SchemaGetter.transform((tasks: typeof TasksApiSchema.Type) => listResult(tasks.map(taskFromApi), limit)),
      encode: SchemaGetter.transform((result: ListResult<TaskRecord>) => result.records.map(taskToApi)),
    })
  )

export const SearchResponseSchema = (query: string, limit: number) =>
  SearchResponseApiSchema.pipe(
    Schema.decodeTo(DomainSearchResultSchema, {
      decode: SchemaGetter.transform(
        (response: typeof SearchResponseApiSchema.Type): SearchResult => ({
          query,
          queryType: fromNullable(response.queryType),
          videos: listResult((response.results.video_results ?? []).map(videoFromApi), limit),
          channels: listResult((response.results.channel_results ?? []).map(channelFromApi), limit),
          playlists: listResult((response.results.playlist_results ?? []).map(playlistFromApi), limit),
        })
      ),
      encode: SchemaGetter.transform((result: SearchResult) => ({
        queryType: result.queryType,
        results: {
          video_results: result.videos.records.map(videoToApi),
          channel_results: result.channels.records.map(channelToApi),
          playlist_results: result.playlists.records.map(playlistToApi),
        },
      })),
    })
  )
