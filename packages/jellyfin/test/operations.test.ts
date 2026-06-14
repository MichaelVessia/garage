import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import {
  JellyfinApi,
  JellyfinConfig,
  envMissing,
  itemSearch,
  libraries,
  libraryStats,
  nowPlaying,
  recentlyAdded,
  runTask,
  scheduledTasks,
  sessions,
  status,
  users,
} from '../src/index.js'
import type { LimitOptions, SearchOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(JellyfinConfig, {
  get: () => Effect.fail(envMissing('JELLYFIN_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const runTasks = yield* Ref.make<ReadonlyArray<string>>([])
  const api = JellyfinApi.of({
    status: () => Effect.succeed({ serverName: 'Jellyfin', version: '10.10.7' }),
    users: () => Effect.succeed({ count: 1, records: [{ id: 'u1', name: 'Test User', isAdministrator: true }] }),
    libraries: () =>
      Effect.succeed({ count: 1, records: [{ name: 'Movies', collectionType: 'movies', itemId: 'lib1' }] }),
    sessions: () =>
      Effect.succeed({
        count: 2,
        records: [
          {
            sessionId: 's1',
            user: 'Test User',
            client: 'Web',
            device: 'Test Client',
            nowPlaying: 'Linux ISO',
            playMethod: 'DirectPlay',
          },
          { sessionId: 's2', user: 'Idle', client: 'TV' },
        ],
      }),
    recentlyAdded: (options) =>
      Ref.update(recentOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 'i1', name: 'Linux ISO', type: 'Movie' }] })
      ),
    itemSearch: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 'i1', name: 'Linux ISO', type: 'Movie' }] })
      ),
    libraryStats: () => Effect.succeed({ MovieCount: 100, SeriesCount: 10 }),
    scheduledTasks: () =>
      Effect.succeed({ count: 1, records: [{ id: 'task1', name: 'Scan Media Library', state: 'Idle' }] }),
    runTask: (taskId) =>
      Ref.update(runTasks, (records) => [...records, taskId]).pipe(
        Effect.as({ started: true, taskId, httpStatus: 204 })
      ),
  })

  return { layer: Layer.succeed(JellyfinApi, api), recentOptions, searchOptions, runTasks }
})

it.effect('runs Jellyfin read and mutation operations without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).version, '10.10.7')
    assert.strictEqual((yield* users.pipe(Effect.provide(layer))).records[0]?.name, 'Test User')
    assert.strictEqual((yield* libraries.pipe(Effect.provide(layer))).records[0]?.name, 'Movies')
    assert.strictEqual((yield* sessions.pipe(Effect.provide(layer))).count, 2)
    assert.strictEqual((yield* nowPlaying.pipe(Effect.provide(layer))).records[0]?.item, 'Linux ISO')
    assert.strictEqual((yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer))).count, 1)
    assert.strictEqual((yield* itemSearch({ query: 'Linux', limit: 4 }).pipe(Effect.provide(layer))).count, 1)
    assert.strictEqual((yield* libraryStats.pipe(Effect.provide(layer))).MovieCount, 100)
    assert.strictEqual((yield* scheduledTasks.pipe(Effect.provide(layer))).records[0]?.state, 'Idle')
    assert.deepStrictEqual(yield* runTask('task1').pipe(Effect.provide(layer)), {
      started: true,
      taskId: 'task1',
      httpStatus: 204,
    })
    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'Linux', limit: 4 }])
    assert.deepStrictEqual(yield* Ref.get(fake.runTasks), ['task1'])
  })
)
