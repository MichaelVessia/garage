import { assert, it } from '@effect/vitest'
import { ImmichApi, ImmichConfig, envMissing } from '@garage/immich'
import type { AlbumInfoOptions, LimitOptions, SearchOptions } from '@garage/immich'
import { Effect, Layer, Redacted, Ref } from 'effect'

import { executeImmich } from '../src/index.js'

const ConfigLayer = Layer.succeed(ImmichConfig, {
  get: () => Effect.succeed({ url: 'http://immich.example.test', apiKey: Redacted.make('secret') }),
})

const MissingConfigLayer = Layer.succeed(ImmichConfig, {
  get: () => Effect.fail(envMissing('IMMICH_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const albumOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const albumInfoOptions = yield* Ref.make<ReadonlyArray<AlbumInfoOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const peopleOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const personIds = yield* Ref.make<ReadonlyArray<string>>([])
  const layer = Layer.effect(
    ImmichApi,
    Effect.gen(function* () {
      const config = yield* ImmichConfig
      const configured = <A>(effect: Effect.Effect<A>) => config.get().pipe(Effect.andThen(effect))
      return ImmichApi.of({
        status: () =>
          configured(
            Effect.succeed({ version: '2.5.6', versionParts: { major: 2, minor: 5, patch: 6 }, ping: 'pong' })
          ),
        stats: () =>
          configured(
            Effect.succeed({
              photos: 10,
              videos: 2,
              usageBytes: 1000,
              usagePhotosBytes: 700,
              usageVideosBytes: 300,
              perUser: [],
            })
          ),
        storage: () => configured(Effect.succeed({ diskSize: '10 TiB' })),
        users: () => configured(Effect.succeed({ count: 1, records: [{ id: 'u1', name: 'Test User' }] })),
        me: () => configured(Effect.succeed({ id: 'u1', name: 'Test User' })),
        albums: (options) =>
          configured(
            Ref.update(albumOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ id: 'a1', albumName: 'Family' }] })
            )
          ),
        albumInfo: (options) =>
          configured(
            Ref.update(albumInfoOptions, (records) => [...records, options]).pipe(
              Effect.as({
                id: options.id,
                albumName: 'Family',
                assets: { count: 0, records: [] },
                moreAssetsAvailable: false,
              })
            )
          ),
        search: (options) =>
          configured(
            Ref.update(searchOptions, (records) => [...records, options]).pipe(
              Effect.as({ mode: 'smart', query: options.query, total: 1, count: 1, records: [{ id: 'asset1' }] })
            )
          ),
        recent: (options) =>
          configured(
            Ref.update(recentOptions, (records) => [...records, options]).pipe(
              Effect.as({ mode: 'metadata', query: 'recent', total: 1, count: 1, records: [{ id: 'asset2' }] })
            )
          ),
        people: (options) =>
          configured(
            Ref.update(peopleOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ id: 'p1', name: 'Person' }], total: 1 })
            )
          ),
        personInfo: (personId) =>
          configured(
            Ref.update(personIds, (records) => [...records, personId]).pipe(Effect.as({ id: personId, name: 'Person' }))
          ),
        jobs: () =>
          configured(Effect.succeed({ count: 1, records: [{ queue: 'smartSearch', counts: { waiting: 0 } }] })),
        tags: () => configured(Effect.succeed({ count: 1, records: [{ id: 't1', name: 'vacation' }] })),
      })
    })
  )
  return {
    layer,
    albumOptions,
    albumInfoOptions,
    searchOptions,
    recentOptions,
    peopleOptions,
    personIds,
  }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const ok = yield* executeImmich([]).pipe(Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer))))
    const missing = yield* executeImmich([]).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, { configured: true, version: '2.5.6', ping: 'pong' })
    assert.strictEqual(missing.ok, true)
    if (!missing.ok || !('health' in missing.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(missing.result.health, { configured: false })
  })
)

it.effect('bounded commands pass limits and search args', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    yield* executeImmich(['albums', '--limit', '3']).pipe(Effect.provide(layer))
    yield* executeImmich(['album-info', 'a1', '--limit', '4']).pipe(Effect.provide(layer))
    yield* executeImmich(['search', 'kids', 'beach', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeImmich(['recent', '--limit', '6']).pipe(Effect.provide(layer))
    yield* executeImmich(['people', '--limit', '7']).pipe(Effect.provide(layer))
    yield* executeImmich(['person-info', 'p1']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.albumOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.albumInfoOptions), [{ id: 'a1', limit: 4 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'kids beach', limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 6 }])
    assert.deepStrictEqual(yield* Ref.get(fake.peopleOptions), [{ limit: 7 }])
    assert.deepStrictEqual(yield* Ref.get(fake.personIds), ['p1'])
  })
)

it.effect('missing env on subcommands returns an error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeImmich(['stats']).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(envelope.ok, false)
    if (envelope.ok) {
      assert.fail('expected error envelope')
    }
    assert.strictEqual(envelope.error.code, 'IMMICH_ENV_MISSING')
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    for (const args of [['status'], ['stats'], ['storage'], ['users'], ['me'], ['jobs'], ['library-stats'], ['tags']]) {
      const envelope = yield* executeImmich(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
