import * as Effect from 'effect/Effect'

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
import { JellyseerrApi } from './services.js'
import type { JellyseerrConfig } from './services.js'

export const defaultLimit = 10

const defaultRequestOptions: RequestListOptions = { limit: defaultLimit, filter: 'pending' }
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status: Effect.Effect<SystemStatus, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.gen(
  function* () {
    const api = yield* JellyseerrApi
    return yield* api.status()
  }
).pipe(
  Effect.withSpan('jellyseerr.status'),
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'status' })
)

export const requests: (
  options?: RequestListOptions
) => Effect.Effect<ListResult<RequestRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.fn(
  'jellyseerr.requests'
)(
  function* (
    options?: RequestListOptions
  ): Effect.fn.Return<ListResult<RequestRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    const requestOptions = options ?? defaultRequestOptions
    yield* Effect.annotateCurrentSpan({
      'jellyseerr.limit': requestOptions.limit,
      'jellyseerr.filter': requestOptions.filter,
    })
    const api = yield* JellyseerrApi
    return yield* api.requests(requestOptions)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'requests' })
)

export const requestCounts: Effect.Effect<RequestCounts, JellyseerrError, JellyseerrApi | JellyseerrConfig> =
  Effect.gen(function* () {
    const api = yield* JellyseerrApi
    return yield* api.requestCounts()
  }).pipe(
    Effect.withSpan('jellyseerr.requestCounts'),
    Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'requestCounts' })
  )

export const search = Effect.fn('jellyseerr.search')(
  function* (
    options: SearchOptions
  ): Effect.fn.Return<ListResult<SearchRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    yield* Effect.annotateCurrentSpan({
      'jellyseerr.query_length': options.query.length,
      'jellyseerr.limit': options.limit,
    })
    const api = yield* JellyseerrApi
    return yield* api.search(options)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'search' })
)

export const mediaStatus = Effect.fn('jellyseerr.mediaStatus')(
  function* (mediaId: number): Effect.fn.Return<MediaSummary, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.media_id': mediaId })
    const api = yield* JellyseerrApi
    return yield* api.mediaStatus(mediaId)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'mediaStatus' })
)

export const recentlyAdded: (
  options?: LimitOptions
) => Effect.Effect<ListResult<MediaSummary>, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.fn(
  'jellyseerr.recentlyAdded'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<MediaSummary>, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.limit': limitOptions.limit })
    const api = yield* JellyseerrApi
    return yield* api.recentlyAdded(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'recentlyAdded' })
)

export const approve = Effect.fn('jellyseerr.approve')(
  function* (requestId: number): Effect.fn.Return<RequestRecord, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.request_id': requestId })
    const api = yield* JellyseerrApi
    return yield* api.approve(requestId)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'approve' })
)

export const decline = Effect.fn('jellyseerr.decline')(
  function* (requestId: number): Effect.fn.Return<RequestRecord, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.request_id': requestId })
    const api = yield* JellyseerrApi
    return yield* api.decline(requestId)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'decline' })
)

export const deleteRequest = Effect.fn('jellyseerr.deleteRequest')(
  function* (
    requestId: number
  ): Effect.fn.Return<DeleteRequestResult, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.request_id': requestId })
    const api = yield* JellyseerrApi
    return yield* api.deleteRequest(requestId)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'deleteRequest' })
)

export const users: (
  options?: LimitOptions
) => Effect.Effect<ListResult<UserRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.fn(
  'jellyseerr.users'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<UserRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.limit': limitOptions.limit })
    const api = yield* JellyseerrApi
    return yield* api.users(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'users' })
)

export const issues: (
  options?: LimitOptions
) => Effect.Effect<ListResult<IssueRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> = Effect.fn(
  'jellyseerr.issues'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<IssueRecord>, JellyseerrError, JellyseerrApi | JellyseerrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'jellyseerr.limit': limitOptions.limit })
    const api = yield* JellyseerrApi
    return yield* api.issues(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', operation: 'issues' })
)
