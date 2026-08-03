import { assert, it } from '@effect/vitest'
import { JellyfinApi, JellyfinConfig, envMissing } from '@garage/jellyfin'
import type { LimitOptions, SearchOptions } from '@garage/jellyfin'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import { executeJellyfin } from '../src/index.js'

const ConfigLayer = Layer.succeed(JellyfinConfig, {
  get: () => Effect.succeed({ url: 'http://jellyfin.example.test', apiKey: Redacted.make('secret') }),
})

const MissingConfigLayer = Layer.succeed(JellyfinConfig, {
  get: () => Effect.fail(envMissing('JELLYFIN_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const runTasks = yield* Ref.make<ReadonlyArray<string>>([])
  const layer = Layer.effect(
    JellyfinApi,
    Effect.gen(function* () {
      const config = yield* JellyfinConfig
      const configured = <A>(effect: Effect.Effect<A>) => config.get().pipe(Effect.andThen(effect))
      return JellyfinApi.of({
        status: () => configured(Effect.succeed({ serverName: 'Jellyfin', version: '10.10.7' })),
        users: () => configured(Effect.succeed({ count: 1, records: [{ id: 'u1', name: 'Test User' }] })),
        libraries: () => configured(Effect.succeed({ count: 1, records: [{ name: 'Movies' }] })),
        sessions: () =>
          configured(
            Effect.succeed({ count: 1, records: [{ sessionId: 's1', user: 'Test User', nowPlaying: 'Linux ISO' }] })
          ),
        recentlyAdded: (options) =>
          configured(
            Ref.update(recentOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ id: 'i1', name: 'Linux ISO' }] })
            )
          ),
        itemSearch: (options) =>
          configured(
            Ref.update(searchOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ id: 'i1', name: 'Linux ISO' }] })
            )
          ),
        libraryStats: () => configured(Effect.succeed({ MovieCount: 100 })),
        scheduledTasks: () =>
          configured(Effect.succeed({ count: 1, records: [{ id: 'task1', name: 'Scan', state: 'Idle' }] })),
        runTask: (taskId) =>
          configured(
            Ref.update(runTasks, (records) => [...records, taskId]).pipe(
              Effect.as({ started: true, taskId, httpStatus: 204 })
            )
          ),
      })
    })
  )
  return { layer, recentOptions, searchOptions, runTasks }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const ok = yield* executeJellyfin([]).pipe(Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer))))
    const missing = yield* executeJellyfin([]).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('name' in ok.result) || ok.result.name !== 'jellyfin') {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, { configured: true, version: '10.10.7', serverName: 'Jellyfin' })
    if (P.isNumber(ok.result.commands)) {
      assert.fail('expected root command descriptions')
    }
    assert.strictEqual(
      ok.result.commands.find((command) => command.command.startsWith('jellyfin recently-added'))?.description,
      'Return recently added items visible to JELLYFIN_USER_ID or the sole enabled administrator'
    )
    assert.strictEqual(
      ok.result.commands.find((command) => command.command.startsWith('jellyfin item-search'))?.description,
      'Search movies, series, and episodes visible to JELLYFIN_USER_ID or the sole enabled administrator'
    )
    assert.strictEqual(missing.ok, true)
    if (!missing.ok || !('health' in missing.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(missing.result.health, { configured: false })
  })
)

it.effect('list and search commands pass limits', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    yield* executeJellyfin(['recently-added', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeJellyfin(['item-search', 'Linux', 'ISO', '--limit', '4']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'Linux ISO', limit: 4 }])
  })
)

it.effect('run-task requires confirmation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const blocked = yield* executeJellyfin(['run-task', 'task1']).pipe(Effect.provide(layer))
    const allowed = yield* executeJellyfin(['run-task', 'task1', '--confirm-run-task']).pipe(Effect.provide(layer))

    assert.strictEqual(blocked.ok, false)
    assert.strictEqual(allowed.ok, true)
    assert.deepStrictEqual(yield* Ref.get(fake.runTasks), ['task1'])
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    for (const args of [
      ['status'],
      ['users'],
      ['libraries'],
      ['sessions'],
      ['now-playing'],
      ['library-stats'],
      ['scheduled-tasks'],
    ]) {
      const envelope = yield* executeJellyfin(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
