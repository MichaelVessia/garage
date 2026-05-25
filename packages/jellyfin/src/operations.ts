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
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.status()
  }
).pipe(Effect.withSpan('jellyfin.status'), Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'status' }))

export const users: Effect.Effect<ListResult<UserRecord>, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.gen(
  function* () {
    const config = yield* JellyfinConfig
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.users()
  }
).pipe(Effect.withSpan('jellyfin.users'), Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'users' }))

export const libraries: Effect.Effect<
  ListResult<LibraryRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get()
  const api = yield* JellyfinApi
  return yield* api.libraries()
}).pipe(
  Effect.withSpan('jellyfin.libraries'),
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'libraries' })
)

export const sessions: Effect.Effect<
  ListResult<SessionRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get()
  const api = yield* JellyfinApi
  return yield* api.sessions()
}).pipe(
  Effect.withSpan('jellyfin.sessions'),
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'sessions' })
)

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
}).pipe(
  Effect.withSpan('jellyfin.nowPlaying'),
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'nowPlaying' })
)

export const recentlyAdded: (
  options?: LimitOptions
) => Effect.Effect<ListResult<ItemRecord>, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.fn(
  'jellyfin.recentlyAdded'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<ItemRecord>, JellyfinError, JellyfinApi | JellyfinConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'jellyfin.limit': limitOptions.limit })
    const config = yield* JellyfinConfig
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.recentlyAdded(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'recentlyAdded' })
)

export const itemSearch = Effect.fn('jellyfin.itemSearch')(
  function* (
    options: SearchOptions
  ): Effect.fn.Return<ListResult<ItemRecord>, JellyfinError, JellyfinApi | JellyfinConfig> {
    yield* Effect.annotateCurrentSpan({
      'jellyfin.query_length': options.query.length,
      'jellyfin.limit': options.limit,
    })
    const config = yield* JellyfinConfig
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.itemSearch(options)
  },
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'itemSearch' })
)

export const libraryStats: Effect.Effect<LibraryStats, JellyfinError, JellyfinApi | JellyfinConfig> = Effect.gen(
  function* () {
    const config = yield* JellyfinConfig
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.libraryStats()
  }
).pipe(
  Effect.withSpan('jellyfin.libraryStats'),
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'libraryStats' })
)

export const scheduledTasks: Effect.Effect<
  ListResult<ScheduledTaskRecord>,
  JellyfinError,
  JellyfinApi | JellyfinConfig
> = Effect.gen(function* () {
  const config = yield* JellyfinConfig
  yield* config.get()
  const api = yield* JellyfinApi
  return yield* api.scheduledTasks()
}).pipe(
  Effect.withSpan('jellyfin.scheduledTasks'),
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'scheduledTasks' })
)

export const runTask = Effect.fn('jellyfin.runTask')(
  function* (taskId: string): Effect.fn.Return<RunTaskResult, JellyfinError, JellyfinApi | JellyfinConfig> {
    yield* Effect.annotateCurrentSpan({ 'jellyfin.task_id': taskId })
    const config = yield* JellyfinConfig
    yield* config.get()
    const api = yield* JellyfinApi
    return yield* api.runTask(taskId)
  },
  Effect.annotateLogs({ package: '@garage/jellyfin', operation: 'runTask' })
)
