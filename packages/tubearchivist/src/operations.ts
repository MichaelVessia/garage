import { Effect } from 'effect'

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
import { TubearchivistApi, TubearchivistConfig } from './services.js'

export const defaultLimit = 25
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

const requireConfig = Effect.gen(function* () {
  const config = yield* TubearchivistConfig
  yield* config.get
})

export const status: Effect.Effect<StatusResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> =
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.status
  })

export const channels = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<ChannelRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.channels(options)
  })

export const channelInfo = (
  options: IdOptions
): Effect.Effect<ChannelRecord, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.channelInfo(options)
  })

export const subscribe = (
  options: SubscriptionOptions
): Effect.Effect<SubscriptionResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.subscribe(options)
  })

export const unsubscribe = (options: {
  readonly target: string
  readonly confirmed: boolean
}): Effect.Effect<SubscriptionResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    if (!options.confirmed) {
      return yield* confirmationRequired('--confirm-unsubscribe')
    }
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.unsubscribe({ target: options.target })
  })

export const videos = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<VideoRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.videos(options)
  })

export const videoInfo = (
  options: IdOptions
): Effect.Effect<VideoRecord, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.videoInfo(options)
  })

export const downloads = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<DownloadRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.downloads(options)
  })

export const playlists = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<PlaylistRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.playlists(options)
  })

export const tasks = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<TaskRecord>, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.tasks(options)
  })

export const search = (
  options: SearchOptions
): Effect.Effect<SearchResult, TubearchivistError, TubearchivistApi | TubearchivistConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* TubearchivistApi
    return yield* api.search(options)
  })
