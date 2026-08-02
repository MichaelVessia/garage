import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import {
  TubearchivistApi,
  channelInfo,
  channels,
  downloads,
  playlists,
  search,
  status,
  subscribe,
  tasks,
  unsubscribe,
  videoInfo,
  videos,
} from '../src/index.js'
import type { LimitOptions, SearchOptions, SubscriptionOptions } from '../src/index.js'

const makeApiLayer = Effect.gen(function* () {
  const limitOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const subscriptions = yield* Ref.make<ReadonlyArray<SubscriptionOptions & { readonly subscribed: boolean }>>([])
  const api = TubearchivistApi.of({
    status: () =>
      Effect.succeed({
        url: 'http://tubearchivist.example.test',
        health: 'OK',
        config: {},
        stats: { video: {}, channel: {}, download: {}, watch: {} },
      }),
    channels: (options) =>
      Ref.update(limitOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 'UC1', name: 'Channel', subscribed: true }] })
      ),
    channelInfo: (options) => Effect.succeed({ id: options.id, name: 'Channel' }),
    subscribe: (options) =>
      Ref.update(subscriptions, (records) => [...records, { ...options, subscribed: true }]).pipe(
        Effect.as({ target: options.target, subscribed: true, response: {}, note: 'queued' })
      ),
    unsubscribe: (options) =>
      Ref.update(subscriptions, (records) => [...records, { ...options, subscribed: false }]).pipe(
        Effect.as({ target: options.target, subscribed: false, response: {} })
      ),
    videos: (options) =>
      Ref.update(limitOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ youtubeId: 'v1', title: 'Video' }] })
      ),
    videoInfo: (options) => Effect.succeed({ youtubeId: options.id, title: 'Video' }),
    downloads: (options) =>
      Ref.update(limitOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ youtubeId: 'v1', status: 'pending' }] })
      ),
    playlists: (options) =>
      Ref.update(limitOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ playlistId: 'PL1', name: 'Playlist' }] })
      ),
    tasks: (options) =>
      Ref.update(limitOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ name: 'subscribe_to', status: 'SUCCESS' }] })
      ),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({
          query: options.query,
          videos: { count: 0, records: [] },
          channels: { count: 0, records: [] },
          playlists: { count: 0, records: [] },
        })
      ),
  })
  return { layer: Layer.succeed(TubearchivistApi, api), limitOptions, searchOptions, subscriptions }
})

it.effect('runs TubeArchivist operations and requires unsubscribe confirmation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const { layer } = fake

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).health, 'OK')
    assert.strictEqual((yield* channels({ limit: 3 }).pipe(Effect.provide(layer))).records[0]?.id, 'UC1')
    assert.strictEqual((yield* channelInfo({ id: 'UC1' }).pipe(Effect.provide(layer))).name, 'Channel')
    assert.strictEqual(
      (yield* subscribe({ target: 'https://youtube.com/@example' }).pipe(Effect.provide(layer))).subscribed,
      true
    )
    assert.strictEqual((yield* videos({ limit: 4 }).pipe(Effect.provide(layer))).records[0]?.youtubeId, 'v1')
    assert.strictEqual((yield* videoInfo({ id: 'v1' }).pipe(Effect.provide(layer))).title, 'Video')
    assert.strictEqual((yield* downloads({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.status, 'pending')
    assert.strictEqual((yield* playlists({ limit: 6 }).pipe(Effect.provide(layer))).records[0]?.playlistId, 'PL1')
    assert.strictEqual((yield* tasks({ limit: 7 }).pipe(Effect.provide(layer))).records[0]?.name, 'subscribe_to')
    assert.strictEqual((yield* search({ query: 'kids', limit: 8 }).pipe(Effect.provide(layer))).query, 'kids')

    const denied = yield* unsubscribe({ target: 'UC1', confirmed: false }).pipe(Effect.flip, Effect.provide(layer))
    assert.strictEqual(denied._tag, 'TubearchivistConfirmationRequiredError')
    assert.strictEqual(
      (yield* unsubscribe({ target: 'UC1', confirmed: true }).pipe(Effect.provide(layer))).subscribed,
      false
    )
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'kids', limit: 8 }])
    assert.deepStrictEqual(yield* Ref.get(fake.subscriptions), [
      { target: 'https://youtube.com/@example', subscribed: true },
      { target: 'UC1', subscribed: false },
    ])
  })
)
