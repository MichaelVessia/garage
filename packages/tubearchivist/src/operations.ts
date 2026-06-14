import * as Effect from 'effect/Effect'

import { confirmationRequired } from './errors.js'
import type { TubearchivistError } from './errors.js'
import type {
  ChannelRecord,
  DownloadRecord,
  IdOptions,
  LimitOptions,
  ListResult,
  PlaylistRecord,
  SearchOptions,
  SearchResult,
  StatusResult,
  SubscriptionOptions,
  SubscriptionResult,
  TaskRecord,
  VideoRecord,
} from './model.js'
import { TubearchivistApi } from './services.js'
import type { TubearchivistConfig } from './services.js'

export const defaultLimit = 25
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status: Effect.Effect<StatusResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> =
  Effect.gen(function* () {
    const api = yield* TubearchivistApi
    return yield* api.status()
  }).pipe(
    Effect.withSpan('tubearchivist.status'),
    Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'status' })
  )

export const channels: (
  options?: LimitOptions
) => Effect.Effect<ListResult<ChannelRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> = Effect.fn(
  'tubearchivist.channels'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<ChannelRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': limitOptions.limit })
    const api = yield* TubearchivistApi
    return yield* api.channels(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'channels' })
)

export const channelInfo = Effect.fn('tubearchivist.channelInfo')(
  function* (
    options: IdOptions
  ): Effect.fn.Return<ChannelRecord, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const api = yield* TubearchivistApi
    return yield* api.channelInfo(options)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'channelInfo' })
)

export const subscribe = Effect.fn('tubearchivist.subscribe')(
  function* (
    options: SubscriptionOptions
  ): Effect.fn.Return<SubscriptionResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const api = yield* TubearchivistApi
    return yield* api.subscribe(options)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'subscribe' })
)

export const unsubscribe = Effect.fn('tubearchivist.unsubscribe')(
  function* (options: {
    readonly target: string
    readonly confirmed: boolean
  }): Effect.fn.Return<SubscriptionResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    if (!options.confirmed) {
      return yield* confirmationRequired('--confirm-unsubscribe')
    }
    const api = yield* TubearchivistApi
    return yield* api.unsubscribe({ target: options.target })
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'unsubscribe' })
)

export const videos: (
  options?: LimitOptions
) => Effect.Effect<ListResult<VideoRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> = Effect.fn(
  'tubearchivist.videos'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<VideoRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': limitOptions.limit })
    const api = yield* TubearchivistApi
    return yield* api.videos(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'videos' })
)

export const videoInfo = Effect.fn('tubearchivist.videoInfo')(
  function* (
    options: IdOptions
  ): Effect.fn.Return<VideoRecord, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const api = yield* TubearchivistApi
    return yield* api.videoInfo(options)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'videoInfo' })
)

export const downloads: (
  options?: LimitOptions
) => Effect.Effect<ListResult<DownloadRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> = Effect.fn(
  'tubearchivist.downloads'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<DownloadRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': limitOptions.limit })
    const api = yield* TubearchivistApi
    return yield* api.downloads(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'downloads' })
)

export const playlists: (
  options?: LimitOptions
) => Effect.Effect<ListResult<PlaylistRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> = Effect.fn(
  'tubearchivist.playlists'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<PlaylistRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': limitOptions.limit })
    const api = yield* TubearchivistApi
    return yield* api.playlists(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'playlists' })
)

export const tasks: (
  options?: LimitOptions
) => Effect.Effect<ListResult<TaskRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> = Effect.fn(
  'tubearchivist.tasks'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<TaskRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': limitOptions.limit })
    const api = yield* TubearchivistApi
    return yield* api.tasks(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'tasks' })
)

export const search = Effect.fn('tubearchivist.search')(
  function* (
    options: SearchOptions
  ): Effect.fn.Return<SearchResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> {
    yield* Effect.annotateCurrentSpan({
      'tubearchivist.query_length': options.query.length,
      'tubearchivist.limit': options.limit,
    })
    const api = yield* TubearchivistApi
    return yield* api.search(options)
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', operation: 'search' })
)
