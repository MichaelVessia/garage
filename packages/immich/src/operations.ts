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

const requireConfig = Effect.gen(function* () {
  const config = yield* ImmichConfig
  yield* config.get
})

export const status: Effect.Effect<SystemStatus, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* ImmichApi
  return yield* api.status
})

export const stats: Effect.Effect<Statistics, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* ImmichApi
  return yield* api.stats
})

export const storage: Effect.Effect<StorageStatus, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* ImmichApi
  return yield* api.storage
})

export const users: Effect.Effect<UsersResult, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* ImmichApi
  return yield* api.users
})

export const me: Effect.Effect<CurrentUser, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* ImmichApi
  return yield* api.me
})

export const albums = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<AlbumSummary>, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.albums(options)
  })

export const albumInfo = (options: AlbumInfoOptions): Effect.Effect<AlbumInfo, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.albumInfo(options)
  })

export const search = (options: SearchOptions): Effect.Effect<SearchResult, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.search(options)
  })

export const recent = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<SearchResult, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.recent(options)
  })

export const people = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<PeopleResult, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.people(options)
  })

export const personInfo = (personId: string): Effect.Effect<PersonRecord, ImmichError, ImmichApi | ImmichConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.personInfo(personId)
  })

export const jobs: Effect.Effect<ListResult<JobRecord>, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.jobs
  }
)

export const libraryStats: Effect.Effect<Statistics, ImmichError, ImmichApi | ImmichConfig> = stats

export const tags: Effect.Effect<ListResult<TagRecord>, ImmichError, ImmichApi | ImmichConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* ImmichApi
    return yield* api.tags
  }
)
