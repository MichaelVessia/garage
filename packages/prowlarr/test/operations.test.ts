import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import {
  ProwlarrApi,
  applications,
  health,
  history,
  indexerStats,
  indexers,
  movieSearch,
  search,
  status,
  sync,
  testIndexer,
  tvSearch,
} from '../src/index.js'
import type { ReleaseRecord, SearchOptions } from '../src/index.js'

const firstReleaseRecord: ReleaseRecord = {
  guid: 'release-1',
  indexerId: 1,
  indexer: 'Mirror Indexer',
  title: 'Linux ISO 2026 1080p',
  protocol: 'torrent',
  size: 2_097_152,
  sizeMB: 2,
  seeders: 42,
  leechers: 1,
  grabs: 7,
  age: 1,
  publishDate: '2026-05-24T00:00:00Z',
  downloadUrl: 'https://example.test/download/1',
  infoUrl: 'https://example.test/info/1',
  categories: [2000],
}

const secondReleaseRecord: ReleaseRecord = {
  guid: 'release-2',
  indexerId: 2,
  indexer: 'Usenet Indexer',
  title: 'Linux ISO 2026 2160p',
  protocol: 'usenet',
  size: 4_194_304,
  sizeMB: 4,
  seeders: 0,
  grabs: 2,
  age: 2,
  publishDate: '2026-05-23T00:00:00Z',
  downloadUrl: 'https://example.test/download/2',
  categories: [2000],
}

const releaseRecords: ReadonlyArray<ReleaseRecord> = [firstReleaseRecord, secondReleaseRecord]

const makeApiLayer = Effect.gen(function* () {
  const searches = yield* Ref.make<ReadonlyArray<{ readonly query: string; readonly options: SearchOptions }>>([])
  const historyLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const syncCount = yield* Ref.make(0)
  const api = ProwlarrApi.of({
    status: () =>
      Effect.succeed({
        appName: 'Prowlarr',
        version: '1.30.2',
        instanceName: 'Prowlarr',
        branch: 'main',
        runtimeVersion: '8.0.0',
        osName: 'linux',
      }),
    health: () =>
      Effect.succeed([
        { source: 'Indexer', type: 'warning', message: 'Indexer unavailable', wikiUrl: 'https://wiki.example.test' },
        { source: 'Application', type: 'error', message: 'App sync failed' },
      ]),
    indexers: () =>
      Effect.succeed([
        {
          id: 1,
          name: 'Mirror Indexer',
          protocol: 'torrent',
          enabled: true,
          priority: 25,
          supportsSearch: true,
          supportsRss: true,
        },
        {
          id: 2,
          name: 'Usenet Indexer',
          protocol: 'usenet',
          enabled: true,
          priority: 50,
          supportsSearch: true,
          supportsRss: false,
        },
      ]),
    indexerStats: () =>
      Effect.succeed([
        {
          id: 1,
          name: 'Mirror Indexer',
          queries: 10,
          grabs: 2,
          failedQueries: 1,
          failedGrabs: 0,
          avgResponseTimeMs: 512,
        },
        {
          id: 2,
          name: 'Usenet Indexer',
          queries: 5,
          grabs: 1,
          failedQueries: 0,
          failedGrabs: 0,
          avgResponseTimeMs: 256,
        },
      ]),
    search: (query, options) =>
      Ref.update(searches, (records) => [...records, { query, options }]).pipe(Effect.as(releaseRecords)),
    testIndexer: (indexerId) => Effect.succeed({ indexerId, passed: true, httpStatus: 200 }),
    applications: () =>
      Effect.succeed([
        { id: 10, name: 'Sonarr', implementation: 'Sonarr', syncLevel: 'fullSync', tags: [1] },
        { id: 11, name: 'Radarr', implementation: 'Radarr', syncLevel: 'fullSync', tags: [2] },
      ]),
    sync: () =>
      Ref.update(syncCount, (count) => count + 1).pipe(
        Effect.as({ id: 99, name: 'ApplicationIndexerSync', status: 'queued', queued: '2026-05-24T00:00:00Z' })
      ),
    history: (limit) =>
      Ref.update(historyLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 1,
          totalRecords: 100,
          records: [
            {
              id: 100,
              date: '2026-05-24T00:00:00Z',
              eventType: 'query',
              indexerId: 1,
              successful: true,
              query: 'Linux ISO',
              queryType: 'search',
              results: 2,
              elapsedTime: 123,
            },
          ],
        })
      ),
  })

  return { layer: Layer.succeed(ProwlarrApi, api), searches, historyLimits, syncCount }
})

it.effect('returns status and bounded list results without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const statusResult = yield* status.pipe(Effect.provide(fake.layer))
    const healthResult = yield* health({ limit: 1 }).pipe(Effect.provide(fake.layer))
    const indexersResult = yield* indexers({ limit: 1 }).pipe(Effect.provide(fake.layer))
    const statsResult = yield* indexerStats({ limit: 1 }).pipe(Effect.provide(fake.layer))

    assert.strictEqual(statusResult.version, '1.30.2')
    assert.deepStrictEqual(healthResult, {
      count: 1,
      totalRecords: 2,
      records: [
        { source: 'Indexer', type: 'warning', message: 'Indexer unavailable', wikiUrl: 'https://wiki.example.test' },
      ],
    })
    assert.strictEqual(indexersResult.count, 1)
    assert.strictEqual(indexersResult.totalRecords, 2)
    assert.strictEqual(statsResult.records[0]?.failedQueries, 1)
  })
)

it.effect('builds search query variants and bounds release results without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const searchResult = yield* search('Linux ISO', {
      limit: 1,
      protocol: 'torrent',
      category: 2000,
      type: 'search',
    }).pipe(Effect.provide(fake.layer))
    const tvResult = yield* tvSearch({ tvdbId: 81_189, season: 1, episode: 2, limit: 1 }).pipe(
      Effect.provide(fake.layer)
    )
    const movieResult = yield* movieSearch({ imdbId: 'tt0111161', tmdbId: 278, limit: 1 }).pipe(
      Effect.provide(fake.layer)
    )
    const searches = yield* Ref.get(fake.searches)

    assert.deepStrictEqual(searchResult, {
      query: 'Linux ISO',
      type: 'search',
      count: 1,
      totalRecords: 2,
      records: [firstReleaseRecord],
    })
    assert.strictEqual(tvResult.query, '{TvdbId:81189} {Season:1} {Episode:2}')
    assert.strictEqual(movieResult.query, '{ImdbId:tt0111161} {TmdbId:278}')
    assert.deepStrictEqual(
      searches.map((record) => record.options),
      [
        { limit: 1, protocol: 'torrent', category: 2000, type: 'search' },
        { limit: 1, type: 'tvsearch' },
        { limit: 1, type: 'movie' },
      ]
    )
  })
)

it.effect('runs indexer tests, application sync, apps, and history operations without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const testResult = yield* testIndexer(7).pipe(Effect.provide(fake.layer))
    const appsResult = yield* applications({ limit: 1 }).pipe(Effect.provide(fake.layer))
    const syncResult = yield* sync.pipe(Effect.provide(fake.layer))
    const historyResult = yield* history({ limit: 25 }).pipe(Effect.provide(fake.layer))
    const historyLimits = yield* Ref.get(fake.historyLimits)
    const syncCount = yield* Ref.get(fake.syncCount)

    assert.deepStrictEqual(testResult, { indexerId: 7, passed: true, httpStatus: 200 })
    assert.strictEqual(appsResult.count, 1)
    assert.strictEqual(appsResult.totalRecords, 2)
    assert.deepStrictEqual(syncResult, {
      id: 99,
      name: 'ApplicationIndexerSync',
      status: 'queued',
      queued: '2026-05-24T00:00:00Z',
    })
    assert.deepStrictEqual(historyLimits, [25])
    assert.strictEqual(syncCount, 1)
    assert.strictEqual(historyResult.totalRecords, 100)
  })
)
