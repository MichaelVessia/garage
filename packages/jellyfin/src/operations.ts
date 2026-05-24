import { Effect } from 'effect'

import type { JellyfinError } from './errors.js'
import type {
  ItemRecord,
  LibraryRecord,
  LibraryStats,
  LimitOptions,
  ListResult,
  NowPlayingRecord,
  RunTaskResult,
  ScheduledTaskRecord,
  SearchOptions,
  SessionRecord,
  SystemStatus,
  UserRecord,
} from './model.js'
import { JellyfinApi, JellyfinConfig } from './services.js'

export const defaultLimit = 10
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status: Effect.Effect<SystemStatus, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.gen(
  function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.status
  }
)

export const users: Effect.Effect<ListResult<UserRecord>, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.gen(
  function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.users
  }
)

export const libraries: Effect.Effect<
  ListResult<LibraryRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get
  const api = yield* JellyfinApi
  return yield* api.libraries
})

export const sessions: Effect.Effect<
  ListResult<SessionRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get
  const api = yield* JellyfinApi
  return yield* api.sessions
})

export const nowPlaying: Effect.Effect<
  ListResult<NowPlayingRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const sessionList = yield* sessions
  const records = sessionList.records.flatMap((session) =>
    session.nowPlaying === undefined
      ? []
      : [
          {
            user: session.user,
            device: session.device,
            client: session.client,
            item: session.nowPlaying,
            playMethod: session.playMethod,
          },
        ]
  )
  return { count: records.length, records }
})

export const recentlyAdded = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<ItemRecord>, JellyfinError, JellyfinApi | JellyfinConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.recentlyAdded(options)
  })

export const itemSearch = (
  options: SearchOptions
): Effect.Effect<ListResult<ItemRecord>, JellyfinError, JellyfinApi | JellyfinConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.itemSearch(options)
  })

export const libraryStats: Effect.Effect<LibraryStats, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.gen(
  function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.libraryStats
  }
)

export const scheduledTasks: Effect.Effect<
  ListResult<ScheduledTaskRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get
  const api = yield* JellyfinApi
  return yield* api.scheduledTasks
})

export const runTask = (taskId: string): Effect.Effect<RunTaskResult, JellyfinError, JellyfinApi | JellyfinConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyfinConfig
    yield* config.get
    const api = yield* JellyfinApi
    return yield* api.runTask(taskId)
  })
