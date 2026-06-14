import * as BunFileSystem from '@effect/platform-bun/BunFileSystem'
import * as BunPath from '@effect/platform-bun/BunPath'
import { assert, it } from '@effect/vitest'
import { TubearchivistApi, TubearchivistConfig, TubearchivistSessionCache, envMissing } from '@garage/tubearchivist'
import type { LimitOptions, SearchOptions, SubscriptionOptions, TubearchivistError } from '@garage/tubearchivist'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import { FileSystem } from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { Path } from 'effect/Path'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import { executeTubearchivist } from '../src/index.js'
import { TubearchivistSessionCacheFileLive } from '../src/session-cache.js'

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const sessionCacheRoot = '/tmp/garage-tubearchivist-cache-test'
const SessionCacheTestLayer = TubearchivistSessionCacheFileLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      BunFileSystem.layer,
      BunPath.layer,
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { TMPDIR: sessionCacheRoot, USER: 'cache-user' } }))
    )
  )
)

const ConfigLayer = Layer.succeed(TubearchivistConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://tubearchivist.example.test',
      username: 'admin',
      password: Redacted.make('secret'),
    }),
})

const MissingConfigLayer = Layer.succeed(TubearchivistConfig, {
  get: () => Effect.fail(envMissing('TUBEARCHIVIST_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const limitOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const subscriptions = yield* Ref.make<ReadonlyArray<SubscriptionOptions & { readonly subscribed: boolean }>>([])
  const layer = Layer.effect(
    TubearchivistApi,
    Effect.gen(function* () {
      const config = yield* TubearchivistConfig
      const configured = <A>(effect: Effect.Effect<A>): Effect.Effect<A, TubearchivistError> =>
        config.get().pipe(Effect.andThen(effect))

      return TubearchivistApi.of({
        status: () =>
          configured(
            Effect.succeed({
              url: 'http://tubearchivist.example.test',
              health: 'OK',
              config: {},
              stats: { video: {}, channel: {}, download: {}, watch: {} },
            })
          ),
        channels: (options) =>
          configured(
            Ref.update(limitOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ id: 'UC1', name: 'Channel' }] })
            )
          ),
        channelInfo: (options) => configured(Effect.succeed({ id: options.id, name: 'Channel' })),
        subscribe: (options) =>
          configured(
            Ref.update(subscriptions, (records) => [...records, { ...options, subscribed: true }]).pipe(
              Effect.as({ target: options.target, subscribed: true, response: {}, note: 'queued' })
            )
          ),
        unsubscribe: (options) =>
          configured(
            Ref.update(subscriptions, (records) => [...records, { ...options, subscribed: false }]).pipe(
              Effect.as({ target: options.target, subscribed: false, response: {} })
            )
          ),
        videos: (options) =>
          configured(
            Ref.update(limitOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ youtubeId: 'v1', title: 'Video' }] })
            )
          ),
        videoInfo: (options) => configured(Effect.succeed({ youtubeId: options.id, title: 'Video' })),
        downloads: (options) =>
          configured(
            Ref.update(limitOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ youtubeId: 'v1', status: 'pending' }] })
            )
          ),
        playlists: (options) =>
          configured(
            Ref.update(limitOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ playlistId: 'PL1', name: 'Playlist' }] })
            )
          ),
        tasks: (options) =>
          configured(
            Ref.update(limitOptions, (records) => [...records, options]).pipe(
              Effect.as({ count: 1, records: [{ name: 'subscribe_to', status: 'SUCCESS' }] })
            )
          ),
        search: (options) =>
          configured(
            Ref.update(searchOptions, (records) => [...records, options]).pipe(
              Effect.as({
                query: options.query,
                videos: { count: 0, records: [] },
                channels: { count: 0, records: [] },
                playlists: { count: 0, records: [] },
              })
            )
          ),
      })
    })
  )
  return { layer, limitOptions, searchOptions, subscriptions }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const okLayer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))
    const missingLayer = fake.layer.pipe(Layer.provideMerge(MissingConfigLayer))
    const ok = yield* executeTubearchivist([]).pipe(Effect.provide(okLayer))
    const missing = yield* executeTubearchivist([]).pipe(Effect.provide(missingLayer))

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, { configured: true, health: 'OK' })
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

    yield* executeTubearchivist(['channels', '--limit', '3']).pipe(Effect.provide(layer))
    yield* executeTubearchivist(['videos', '--limit', '4']).pipe(Effect.provide(layer))
    yield* executeTubearchivist(['downloads', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeTubearchivist(['playlists', '--limit', '6']).pipe(Effect.provide(layer))
    yield* executeTubearchivist(['tasks', '--limit', '7']).pipe(Effect.provide(layer))
    yield* executeTubearchivist(['search', 'fixture', 'music', '--limit', '8']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.limitOptions), [
      { limit: 3 },
      { limit: 4 },
      { limit: 5 },
      { limit: 6 },
      { limit: 7 },
    ])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'fixture music', limit: 8 }])
  })
)

it.effect('subscribe dispatches and unsubscribe requires confirmation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const subscribeEnvelope = yield* executeTubearchivist(['subscribe', 'https://youtube.com/@example']).pipe(
      Effect.provide(layer)
    )
    const deniedEnvelope = yield* executeTubearchivist(['unsubscribe', 'UC1']).pipe(Effect.provide(layer))
    const unsubscribeEnvelope = yield* executeTubearchivist(['unsubscribe', 'UC1', '--confirm-unsubscribe']).pipe(
      Effect.provide(layer)
    )

    assert.strictEqual(subscribeEnvelope.ok, true)
    assert.strictEqual(deniedEnvelope.ok, false)
    if (deniedEnvelope.ok) {
      assert.fail('expected confirmation error')
    }
    assert.strictEqual(deniedEnvelope.error.code, 'TUBEARCHIVIST_CONFIRMATION_REQUIRED')
    assert.strictEqual(unsubscribeEnvelope.ok, true)
    assert.deepStrictEqual(yield* Ref.get(fake.subscriptions), [
      { target: 'https://youtube.com/@example', subscribed: true },
      { target: 'UC1', subscribed: false },
    ])
  })
)

it.effect('remaining commands dispatch and missing env on subcommands returns an error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    for (const args of [['status'], ['channel-info', 'UC1'], ['video-info', 'v1']]) {
      const envelope = yield* executeTubearchivist(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }

    const missing = yield* executeTubearchivist(['channels']).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )
    assert.strictEqual(missing.ok, false)
    if (missing.ok) {
      assert.fail('expected error envelope')
    }
    assert.strictEqual(missing.error.code, 'TUBEARCHIVIST_ENV_MISSING')
  })
)

it.effect('file session cache reads cache location from ConfigProvider env', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const path = yield* Path
    const session = { sessionId: 'sid', csrfToken: 'csrf' }
    const key = 'http://tubearchivist.example.test'
    const expectedFile = path.join(
      sessionCacheRoot,
      `tubearchivist-${encodeHex('cache-user')}`,
      `${encodeHex(key)}.json`
    )
    const cache = yield* TubearchivistSessionCache

    yield* cache.write(key, session)

    assert.deepStrictEqual(yield* cache.read(key), Option.some(session))
    assert.strictEqual(yield* fs.readFileString(expectedFile, 'utf-8'), '{"sessionId":"sid","csrfToken":"csrf"}')
    yield* fs.remove(sessionCacheRoot, { force: true, recursive: true })
  }).pipe(Effect.provide(Layer.mergeAll(SessionCacheTestLayer, BunFileSystem.layer, BunPath.layer)))
)
