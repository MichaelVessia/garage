import { Effect } from 'effect'

import type { JellyseerrError } from './errors.js'
import type {
  DeleteRequestResult,
  IssueRecord,
  LimitOptions,
  ListResult,
  MediaSummary,
  RequestCounts,
  RequestListOptions,
  RequestRecord,
  SearchOptions,
  SearchRecord,
  SystemStatus,
  UserRecord,
} from './model.js'
import { JellyseerrApi, JellyseerrConfig } from './services.js'

export const defaultLimit = 10

const defaultRequestOptions: RequestListOptions = { limit: defaultLimit, filter: 'pending' }
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status: Effect.Effect<SystemStatus, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.gen(
  function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.status
  }
)

export const requests = (
  options: RequestListOptions = defaultRequestOptions
): Effect.Effect<ListResult<RequestRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.requests(options)
  })

export const requestCounts: Effect.Effect<RequestCounts, JellyseerrError, JellyseerrApi | JellyseerrConfig> =
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.requestCounts
  })

export const search = (
  options: SearchOptions
): Effect.Effect<ListResult<SearchRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.search(options)
  })

export const mediaStatus = (
  mediaId: number
): Effect.Effect<MediaSummary, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.mediaStatus(mediaId)
  })

export const recentlyAdded = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<MediaSummary>, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.recentlyAdded(options)
  })

export const approve = (
  requestId: number
): Effect.Effect<RequestRecord, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.approve(requestId)
  })

export const decline = (
  requestId: number
): Effect.Effect<RequestRecord, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.decline(requestId)
  })

export const deleteRequest = (
  requestId: number
): Effect.Effect<DeleteRequestResult, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.deleteRequest(requestId)
  })

export const users = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<UserRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.users(options)
  })

export const issues = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<IssueRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> =>
  Effect.gen(function* () {
    const config = yield* JellyseerrConfig
    yield* config.get
    const api = yield* JellyseerrApi
    return yield* api.issues(options)
  })
