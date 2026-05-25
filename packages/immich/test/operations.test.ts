import { assert, it } from '@effect/vitest'
import { Effect, Layer, Redacted, Ref } from 'effect'

import {
  ImmichApi,
  ImmichConfig,
  albumInfo,
  albums,
  jobs,
  libraryStats,
  me,
  people,
  personInfo,
  recent,
  search,
  stats,
  status,
  storage,
  tags,
  users,
} from '../src/index.js'
import type { AlbumInfoOptions, LimitOptions, SearchOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(ImmichConfig, {
  get: () => Effect.succeed({ url: 'http://immich.example.test', apiKey: Redacted.make('secret') }),
})

const makeApiLayer = Effect.gen(function* () {
  const albumOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const albumInfoOptions = yield* Ref.make<ReadonlyArray<AlbumInfoOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const peopleOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const personIds = yield* Ref.make<ReadonlyArray<string>>([])
  const api = ImmichApi.of({
    status: () => Effect.succeed({ version: '2.5.6', versionParts: { major: 2, minor: 5, patch: 6 }, ping: 'pong' }),
    stats: () =>
      Effect.succeed({
        photos: 10,
        videos: 2,
        usageBytes: 1000,
        usagePhotosBytes: 700,
        usageVideosBytes: 300,
        perUser: [{ userId: 'u1', userName: 'Test User', photos: 10, videos: 2, usageBytes: 1000 }],
      }),
    storage: () => Effect.succeed({ diskSize: '10 TiB', diskUse: '4 TiB', diskUsagePercentage: 40 }),
    users: () => Effect.succeed({ count: 1, records: [{ id: 'u1', name: 'Test User', email: 'user@example.test' }] }),
    me: () => Effect.succeed({ id: 'u1', name: 'Test User', email: 'user@example.test', isAdmin: true }),
    albums: (options) =>
      Ref.update(albumOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 'a1', albumName: 'Family', assetCount: 5 }] })
      ),
    albumInfo: (options) =>
      Ref.update(albumInfoOptions, (records) => [...records, options]).pipe(
        Effect.as({
          id: options.id,
          albumName: 'Family',
          assetCount: 5,
          assets: { count: 1, records: [{ id: 'asset1', originalFileName: 'IMG_0001.jpg' }] },
          moreAssetsAvailable: true,
        })
      ),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ mode: 'smart', query: options.query, total: 1, count: 1, records: [{ id: 'asset1' }] })
      ),
    recent: (options) =>
      Ref.update(recentOptions, (records) => [...records, options]).pipe(
        Effect.as({ mode: 'metadata', query: 'recent', total: 1, count: 1, records: [{ id: 'asset2' }] })
      ),
    people: (options) =>
      Ref.update(peopleOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 'p1', name: 'Person' }], total: 1 })
      ),
    personInfo: (personId) =>
      Ref.update(personIds, (records) => [...records, personId]).pipe(Effect.as({ id: personId, name: 'Person' })),
    jobs: () => Effect.succeed({ count: 1, records: [{ queue: 'smartSearch', counts: { waiting: 0, failed: 0 } }] }),
    tags: () => Effect.succeed({ count: 1, records: [{ id: 't1', name: 'vacation' }] }),
  })

  return {
    layer: Layer.succeed(ImmichApi, api),
    albumOptions,
    albumInfoOptions,
    searchOptions,
    recentOptions,
    peopleOptions,
    personIds,
  }
})

it.effect('runs Immich read operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).version, '2.5.6')
    assert.strictEqual((yield* stats.pipe(Effect.provide(layer))).photos, 10)
    assert.strictEqual((yield* libraryStats.pipe(Effect.provide(layer))).videos, 2)
    assert.strictEqual((yield* storage.pipe(Effect.provide(layer))).diskUsagePercentage, 40)
    assert.strictEqual((yield* users.pipe(Effect.provide(layer))).records[0]?.name, 'Test User')
    assert.strictEqual((yield* me.pipe(Effect.provide(layer))).isAdmin, true)
    assert.strictEqual((yield* albums({ limit: 3 }).pipe(Effect.provide(layer))).records[0]?.albumName, 'Family')
    assert.strictEqual((yield* albumInfo({ id: 'a1', limit: 2 }).pipe(Effect.provide(layer))).assets.count, 1)
    assert.strictEqual((yield* search({ query: 'beach', limit: 4 }).pipe(Effect.provide(layer))).mode, 'smart')
    assert.strictEqual((yield* recent({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.id, 'asset2')
    assert.strictEqual((yield* people({ limit: 6 }).pipe(Effect.provide(layer))).records[0]?.id, 'p1')
    assert.strictEqual((yield* personInfo('p1').pipe(Effect.provide(layer))).name, 'Person')
    assert.strictEqual((yield* jobs.pipe(Effect.provide(layer))).records[0]?.queue, 'smartSearch')
    assert.strictEqual((yield* tags.pipe(Effect.provide(layer))).records[0]?.name, 'vacation')
    assert.deepStrictEqual(yield* Ref.get(fake.albumOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.albumInfoOptions), [{ id: 'a1', limit: 2 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'beach', limit: 4 }])
    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.peopleOptions), [{ limit: 6 }])
    assert.deepStrictEqual(yield* Ref.get(fake.personIds), ['p1'])
  })
)
