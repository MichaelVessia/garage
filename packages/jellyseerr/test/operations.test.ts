import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import {
  JellyseerrApi,
  JellyseerrConfig,
  approve,
  decline,
  deleteRequest,
  envMissing,
  issues,
  mediaStatus,
  recentlyAdded,
  requestCounts,
  requests,
  search,
  status,
  users,
} from '../src/index.js'
import type { LimitOptions, RequestListOptions, SearchOptions } from '../src/index.js'

const media = { id: 7, tmdbId: 95_396, mediaType: 'tv', status: 5, title: 'Linux ISO Weekly' }
const request = {
  id: 42,
  status: 1,
  type: 'tv',
  createdAt: '2026-05-24T00:00:00Z',
  requestedBy: 'fixture-user',
  media,
}

const ConfigLayer = Layer.succeed(JellyseerrConfig, {
  get: () => Effect.fail(envMissing('JELLYSEERR_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const requestOptions = yield* Ref.make<ReadonlyArray<RequestListOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const api = JellyseerrApi.of({
    status: () => Effect.succeed({ version: '2.0.0', commitTag: 'v2.0.0', updateAvailable: false }),
    requests: (options) =>
      Ref.update(requestOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, totalRecords: 3, records: [request] })
      ),
    requestCounts: () => Effect.succeed({ pending: 3, approved: 9 }),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({
          count: 1,
          totalRecords: 1,
          records: [{ id: 95_396, mediaType: 'tv', title: 'Linux ISO Weekly', firstAirDate: '2022-02-18' }],
        })
      ),
    mediaStatus: () => Effect.succeed(media),
    recentlyAdded: (options) =>
      Ref.update(recentOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, totalRecords: 1, records: [media] })
      ),
    approve: () => Effect.succeed({ ...request, status: 2 }),
    decline: () => Effect.succeed({ ...request, status: 3 }),
    deleteRequest: (requestId) => Effect.succeed({ deleted: true, requestId, httpStatus: 204 }),
    users: () =>
      Effect.succeed({
        count: 1,
        totalRecords: 1,
        records: [
          { id: 1, email: 'user@example.test', displayName: 'Test User', username: 'fixture-user', permissions: 1 },
        ],
      }),
    issues: () =>
      Effect.succeed({
        count: 1,
        totalRecords: 1,
        records: [{ id: 9, issueType: 'video', status: 1, createdBy: 'fixture-user', media }],
      }),
  })

  return { layer: Layer.succeed(JellyseerrApi, api), requestOptions, searchOptions, recentOptions }
})

it.effect('runs public read operations with bounded options without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const statusResult = yield* status.pipe(Effect.provide(layer))
    const requestsResult = yield* requests({ limit: 5, filter: 'all' }).pipe(Effect.provide(layer))
    const countsResult = yield* requestCounts.pipe(Effect.provide(layer))
    const searchResult = yield* search({ query: 'Linux ISO', limit: 4 }).pipe(Effect.provide(layer))
    const mediaResult = yield* mediaStatus(7).pipe(Effect.provide(layer))
    const recentResult = yield* recentlyAdded({ limit: 6 }).pipe(Effect.provide(layer))
    const usersResult = yield* users({ limit: 7 }).pipe(Effect.provide(layer))
    const issuesResult = yield* issues({ limit: 8 }).pipe(Effect.provide(layer))

    assert.strictEqual(statusResult.version, '2.0.0')
    assert.strictEqual(requestsResult.totalRecords, 3)
    assert.deepStrictEqual(countsResult, { pending: 3, approved: 9 })
    assert.strictEqual(searchResult.records[0]?.title, 'Linux ISO Weekly')
    assert.deepStrictEqual(mediaResult, media)
    assert.deepStrictEqual(recentResult.records, [media])
    assert.strictEqual(usersResult.records[0]?.username, 'fixture-user')
    assert.strictEqual(issuesResult.records[0]?.issueType, 'video')
  })
)

it.effect('runs request mutations through the API service without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const approved = yield* approve(42).pipe(Effect.provide(layer))
    const declined = yield* decline(42).pipe(Effect.provide(layer))
    const deleted = yield* deleteRequest(42).pipe(Effect.provide(layer))

    assert.strictEqual(approved.status, 2)
    assert.strictEqual(declined.status, 3)
    assert.deepStrictEqual(deleted, { deleted: true, requestId: 42, httpStatus: 204 })
  })
)
