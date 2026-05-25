import { Effect } from 'effect'

import type { ImmichError } from './errors.js'
import type {
  AlbumInfo,
  AlbumInfoOptions,
  AlbumSummary,
  CurrentUser,
  JobRecord,
  LimitOptions,
  ListResult,
  PeopleResult,
  PersonRecord,
  SearchOptions,
  SearchResult,
  Statistics,
  StorageStatus,
  SystemStatus,
  TagRecord,
  UsersResult,
} from './model.js'
import { ImmichApi, ImmichConfig } from './services.js'

export const defaultLimit = 25
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

const requireConfig = Effect.fn('immich.requireConfig')(function* () {
  const config = yield* ImmichConfig
  yield* config.get()
})

export const status: Effect.Effect<SystemStatus, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* ImmichApi
  return yield* api.status()
}).pipe(Effect.withSpan('immich.status'), Effect.annotateLogs({ package: '@garage/immich', operation: 'status' }))

export const stats: Effect.Effect<Statistics, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* ImmichApi
  return yield* api.stats()
}).pipe(Effect.withSpan('immich.stats'), Effect.annotateLogs({ package: '@garage/immich', operation: 'stats' }))

export const storage: Effect.Effect<StorageStatus, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* ImmichApi
  return yield* api.storage()
}).pipe(Effect.withSpan('immich.storage'), Effect.annotateLogs({ package: '@garage/immich', operation: 'storage' }))

export const users: Effect.Effect<UsersResult, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* ImmichApi
  return yield* api.users()
}).pipe(Effect.withSpan('immich.users'), Effect.annotateLogs({ package: '@garage/immich', operation: 'users' }))

export const me: Effect.Effect<CurrentUser, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig()
  const api = yield* ImmichApi
  return yield* api.me()
}).pipe(Effect.withSpan('immich.me'), Effect.annotateLogs({ package: '@garage/immich', operation: 'me' }))

export const albums: (
  options?: LimitOptions
) => Effect.Effect<ListResult<AlbumSummary>, ImmichError, ImmichApi | ImmichConfig> = Effect.fn('immich.albums')(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<AlbumSummary>, ImmichError, ImmichApi | ImmichConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'immich.limit': limitOptions.limit })
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.albums(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/immich', operation: 'albums' })
)

export const albumInfo = Effect.fn('immich.albumInfo')(
  function* (options: AlbumInfoOptions): Effect.fn.Return<AlbumInfo, ImmichError, ImmichApi | ImmichConfig> {
    yield* Effect.annotateCurrentSpan({ 'immich.album_id': options.id, 'immich.limit': options.limit })
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.albumInfo(options)
  },
  Effect.annotateLogs({ package: '@garage/immich', operation: 'albumInfo' })
)

export const search = Effect.fn('immich.search')(
  function* (options: SearchOptions): Effect.fn.Return<SearchResult, ImmichError, ImmichApi | ImmichConfig> {
    yield* Effect.annotateCurrentSpan({ 'immich.query_length': options.query.length, 'immich.limit': options.limit })
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.search(options)
  },
  Effect.annotateLogs({ package: '@garage/immich', operation: 'search' })
)

export const recent: (options?: LimitOptions) => Effect.Effect<SearchResult, ImmichError, ImmichApi | ImmichConfig> =
  Effect.fn('immich.recent')(
    function* (options?: LimitOptions): Effect.fn.Return<SearchResult, ImmichError, ImmichApi | ImmichConfig> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'immich.limit': limitOptions.limit, 'immich.search_strategy': 'metadata' })
      yield* requireConfig()
      const api = yield* ImmichApi
      return yield* api.recent(limitOptions)
    },
    Effect.annotateLogs({ package: '@garage/immich', operation: 'recent' })
  )

export const people: (options?: LimitOptions) => Effect.Effect<PeopleResult, ImmichError, ImmichApi | ImmichConfig> =
  Effect.fn('immich.people')(
    function* (options?: LimitOptions): Effect.fn.Return<PeopleResult, ImmichError, ImmichApi | ImmichConfig> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'immich.limit': limitOptions.limit })
      yield* requireConfig()
      const api = yield* ImmichApi
      return yield* api.people(limitOptions)
    },
    Effect.annotateLogs({ package: '@garage/immich', operation: 'people' })
  )

export const personInfo = Effect.fn('immich.personInfo')(
  function* (personId: string): Effect.fn.Return<PersonRecord, ImmichError, ImmichApi | ImmichConfig> {
    yield* Effect.annotateCurrentSpan({ 'immich.person_id': personId })
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.personInfo(personId)
  },
  Effect.annotateLogs({ package: '@garage/immich', operation: 'personInfo' })
)

export const jobs: Effect.Effect<ListResult<JobRecord>, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(
  function* () {
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.jobs()
  }
).pipe(Effect.withSpan('immich.jobs'), Effect.annotateLogs({ package: '@garage/immich', operation: 'jobs' }))

export const libraryStats: Effect.Effect<Statistics, ImmichError, ImmichApi | ImmichConfig> = stats.pipe(
  Effect.withSpan('immich.libraryStats'),
  Effect.annotateLogs({ package: '@garage/immich', operation: 'libraryStats' })
)

export const tags: Effect.Effect<ListResult<TagRecord>, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(
  function* () {
    yield* requireConfig()
    const api = yield* ImmichApi
    return yield* api.tags()
  }
).pipe(Effect.withSpan('immich.tags'), Effect.annotateLogs({ package: '@garage/immich', operation: 'tags' }))
