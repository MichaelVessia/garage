import { JsonObject as BaseJsonObject } from '@garage/cli-protocol'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  ChannelRecord as DomainChannelRecord,
  DownloadRecord as DomainDownloadRecord,
  ListResult as DomainListResult,
  PlaylistRecord as DomainPlaylistRecord,
  SearchResult as DomainSearchResult,
  TaskRecord as DomainTaskRecord,
  VideoRecord as DomainVideoRecord,
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

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const NullableBoolean = Schema.Boolean.pipe(Schema.NullOr, Schema.optional)
const NullableNumber = Schema.Number.pipe(Schema.NullOr, Schema.optional)

export const JsonObject = BaseJsonObject
export type JsonObject = typeof JsonObject.Type

const PaginateApi = Schema.Struct({
  total_hits: NullableNumber,
  page_size: NullableNumber,
})

const ChannelApi = Schema.Struct({
  channel_id: Schema.String,
  channel_name: NullableString,
  channel_subscribed: NullableBoolean,
  channel_active: NullableBoolean,
  channel_last_refresh: NullableString,
})

const VideoChannelApi = Schema.Struct({ channel_name: NullableString })
const PlayerApi = Schema.Struct({ watched: NullableBoolean })

const VideoApi = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel: VideoChannelApi.pipe(Schema.NullOr, Schema.optional),
  published: NullableString,
  vid_type: NullableString,
  player: PlayerApi.pipe(Schema.NullOr, Schema.optional),
})

const DownloadApi = Schema.Struct({
  youtube_id: Schema.String,
  title: NullableString,
  channel_name: NullableString,
  status: NullableString,
  vid_type: NullableString,
})

const PlaylistApi = Schema.Struct({
  playlist_id: Schema.String,
  playlist_name: NullableString,
  playlist_channel: NullableString,
  playlist_subscribed: NullableBoolean,
  playlist_entries: Schema.Array(Schema.Unknown).pipe(Schema.NullOr, Schema.optional),
})

const TaskApi = Schema.Struct({
  name: NullableString,
  status: NullableString,
  date_done: NullableString,
  args: Schema.Array(Schema.Unknown).pipe(Schema.NullOr, Schema.optional),
  kwargs: JsonObject.pipe(Schema.NullOr, Schema.optional),
  task_id: NullableString,
  result: Schema.optional(Schema.Unknown),
})

const ChannelResponseApi = Schema.Struct({
  data: Schema.Array(ChannelApi),
  paginate: PaginateApi.pipe(Schema.NullOr, Schema.optional),
})

const VideoResponseApi = Schema.Struct({
  data: Schema.Array(VideoApi),
  paginate: PaginateApi.pipe(Schema.NullOr, Schema.optional),
})

const DownloadResponseApi = Schema.Struct({
  data: Schema.Array(DownloadApi),
  paginate: PaginateApi.pipe(Schema.NullOr, Schema.optional),
})

const PlaylistResponseApi = Schema.Struct({
  data: Schema.Array(PlaylistApi),
  paginate: PaginateApi.pipe(Schema.NullOr, Schema.optional),
})

const TasksApi = Schema.Array(TaskApi)

const SearchResponseApi = Schema.Struct({
  queryType: NullableString,
  results: Schema.Struct({
    video_results: Schema.Array(VideoApi).pipe(Schema.NullOr, Schema.optional),
    channel_results: Schema.Array(ChannelApi).pipe(Schema.NullOr, Schema.optional),
    playlist_results: Schema.Array(PlaylistApi).pipe(Schema.NullOr, Schema.optional),
  }),
})

// oxlint-disable-next-line effect/prefer-option-over-null -- wire-to-domain bridge: domain records intentionally use `T | undefined` (Schema.optional), so this collapses both null and undefined to the domain `undefined`.
const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

// oxlint-disable-next-line effect/prefer-option-over-null -- accepts the decoded wire `paginate` (nullable optional) and returns the domain `total` which is `number | undefined` (Schema.optional).
const paginateTotal = (paginate: typeof PaginateApi.Type | null | undefined): number | undefined =>
  paginate === null || paginate === undefined ? undefined : fromNullable(paginate.total_hits)

const listResult = <Record>(records: ReadonlyArray<Record>, limit: number, total?: number): ListResult<Record> => {
  const limited = records.slice(0, limit)
  return {
    count: limited.length,
    total,
    records: limited,
    moreAvailable: total === undefined ? records.length > limited.length : total > limited.length,
  }
}

const channelFromApi = (channel: typeof ChannelApi.Type): ChannelRecord => ({
  id: channel.channel_id,
  name: fromNullable(channel.channel_name),
  subscribed: fromNullable(channel.channel_subscribed),
  active: fromNullable(channel.channel_active),
  lastRefresh: fromNullable(channel.channel_last_refresh),
})

const channelToApi = (channel: ChannelRecord): typeof ChannelApi.Type => ({
  channel_id: channel.id,
  channel_name: channel.name,
  channel_subscribed: channel.subscribed,
  channel_active: channel.active,
  channel_last_refresh: channel.lastRefresh,
})

export const ChannelDetailSchema = ChannelApi.pipe(
  Schema.decodeTo(DomainChannelRecord, {
    decode: SchemaGetter.transform(channelFromApi),
    encode: SchemaGetter.transform(channelToApi),
  })
)

const videoFromApi = (video: typeof VideoApi.Type): VideoRecord => ({
  youtubeId: video.youtube_id,
  title: fromNullable(video.title),
  channel: video.channel === null || video.channel === undefined ? undefined : fromNullable(video.channel.channel_name),
  published: fromNullable(video.published),
  videoType: fromNullable(video.vid_type),
  watched: video.player === null || video.player === undefined ? undefined : fromNullable(video.player.watched),
})

const videoToApi = (video: VideoRecord): typeof VideoApi.Type => ({
  youtube_id: video.youtubeId,
  title: video.title,
  channel: video.channel === undefined ? undefined : { channel_name: video.channel },
  published: video.published,
  vid_type: video.videoType,
  player: { watched: video.watched },
})

export const VideoDetailSchema = VideoApi.pipe(
  Schema.decodeTo(DomainVideoRecord, {
    decode: SchemaGetter.transform(videoFromApi),
    encode: SchemaGetter.transform(videoToApi),
  })
)

const downloadFromApi = (download: typeof DownloadApi.Type): DownloadRecord => ({
  youtubeId: download.youtube_id,
  title: fromNullable(download.title),
  channel: fromNullable(download.channel_name),
  status: fromNullable(download.status),
  videoType: fromNullable(download.vid_type),
})

const downloadToApi = (download: DownloadRecord): typeof DownloadApi.Type => ({
  youtube_id: download.youtubeId,
  title: download.title,
  channel_name: download.channel,
  status: download.status,
  vid_type: download.videoType,
})

const playlistFromApi = (playlist: typeof PlaylistApi.Type): PlaylistRecord => ({
  playlistId: playlist.playlist_id,
  name: fromNullable(playlist.playlist_name),
  channel: fromNullable(playlist.playlist_channel),
  subscribed: fromNullable(playlist.playlist_subscribed),
  entries:
    playlist.playlist_entries === null || playlist.playlist_entries === undefined
      ? undefined
      : playlist.playlist_entries.length,
})

const playlistToApi = (playlist: PlaylistRecord): typeof PlaylistApi.Type => ({
  playlist_id: playlist.playlistId,
  playlist_name: playlist.name,
  playlist_channel: playlist.channel,
  playlist_subscribed: playlist.subscribed,
})

const taskFromApi = (task: typeof TaskApi.Type): TaskRecord => ({
  name: fromNullable(task.name),
  status: fromNullable(task.status),
  dateDone: fromNullable(task.date_done),
  args: fromNullable(task.args),
  kwargs: fromNullable(task.kwargs),
  taskId: fromNullable(task.task_id),
  error: task.status === 'FAILURE' ? task.result : undefined,
})

const taskToApi = (task: TaskRecord): typeof TaskApi.Type => ({
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
  total?: number
): ListResult<DomainRecord> => listResult(records.map(mapper), limit, total)

export const ChannelResponseSchema = (limit: number) =>
  ChannelResponseApi.pipe(
    Schema.decodeTo(DomainListResult(DomainChannelRecord), {
      decode: SchemaGetter.transform((response: typeof ChannelResponseApi.Type) =>
        listResponse(response.data, limit, channelFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<ChannelRecord>) => ({
        data: result.records.map(channelToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const VideoResponseSchema = (limit: number) =>
  VideoResponseApi.pipe(
    Schema.decodeTo(DomainListResult(DomainVideoRecord), {
      decode: SchemaGetter.transform((response: typeof VideoResponseApi.Type) =>
        listResponse(response.data, limit, videoFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<VideoRecord>) => ({
        data: result.records.map(videoToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const DownloadResponseSchema = (limit: number) =>
  DownloadResponseApi.pipe(
    Schema.decodeTo(DomainListResult(DomainDownloadRecord), {
      decode: SchemaGetter.transform((response: typeof DownloadResponseApi.Type) =>
        listResponse(response.data, limit, downloadFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<DownloadRecord>) => ({
        data: result.records.map(downloadToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const PlaylistResponseSchema = (limit: number) =>
  PlaylistResponseApi.pipe(
    Schema.decodeTo(DomainListResult(DomainPlaylistRecord), {
      decode: SchemaGetter.transform((response: typeof PlaylistResponseApi.Type) =>
        listResponse(response.data, limit, playlistFromApi, paginateTotal(response.paginate))
      ),
      encode: SchemaGetter.transform((result: ListResult<PlaylistRecord>) => ({
        data: result.records.map(playlistToApi),
        paginate: { total_hits: result.total, page_size: result.count },
      })),
    })
  )

export const TasksSchema = (limit: number) =>
  TasksApi.pipe(
    Schema.decodeTo(DomainListResult(DomainTaskRecord), {
      decode: SchemaGetter.transform((tasks: typeof TasksApi.Type) => listResult(tasks.map(taskFromApi), limit)),
      encode: SchemaGetter.transform((result: ListResult<TaskRecord>) => result.records.map(taskToApi)),
    })
  )

export const SearchResponseSchema = (query: string, limit: number) =>
  SearchResponseApi.pipe(
    Schema.decodeTo(DomainSearchResult, {
      decode: SchemaGetter.transform(
        (response: typeof SearchResponseApi.Type): SearchResult => ({
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
