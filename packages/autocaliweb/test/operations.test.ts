import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import {
  AutocaliwebApi,
  AutocaliwebConfig,
  bookInfo,
  books,
  catalog,
  envMissing,
  recent,
  search,
  shelves,
  stats,
  status,
  version,
} from '../src/index.js'
import type { LimitOptions, SearchOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(AutocaliwebConfig, {
  get: () => Effect.fail(envMissing('AUTOCALIWEB_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const bookOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const api = AutocaliwebApi.of({
    status: () =>
      Effect.succeed({
        title: 'Fixture Catalog',
        updated: '2026-05-24T10:00:00+00:00',
        catalogCount: 1,
        stats: { books: 1, authors: 1, categories: 1, series: 0 },
      }),
    stats: () => Effect.succeed({ books: 1, authors: 1, categories: 1, series: 0 }),
    catalog: () => Effect.succeed({ count: 1, records: [{ title: 'Alphabetical Books', href: '/opds/books' }] }),
    books: (options) =>
      Ref.update(bookOptions, (records) => [...records, options]).pipe(
        Effect.as({
          count: 1,
          records: [{ title: 'Fixture Novel One', authors: [], languages: [], categories: [], downloads: [] }],
        })
      ),
    recent: (options) =>
      Ref.update(recentOptions, (records) => [...records, options]).pipe(
        Effect.as({
          count: 1,
          records: [{ title: 'Fixture Novel Two', authors: [], languages: [], categories: [], downloads: [] }],
        })
      ),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({
          query: options.query,
          total: 1,
          count: 1,
          records: [{ title: 'Fixture Novel One', authors: [], languages: [], categories: [], downloads: [] }],
        })
      ),
    bookInfo: (options) =>
      Effect.succeed({
        id: '42',
        uuid: options.uuid,
        authors: [],
        languages: [],
        categories: [],
        downloads: [],
        formats: [],
        tags: [],
      }),
    shelves: () => Effect.succeed({ count: 1, records: [{ title: 'Favorites', href: '/opds/shelf/1' }] }),
  })
  return { layer: Layer.succeed(AutocaliwebApi, api), bookOptions, recentOptions, searchOptions }
})

it.effect('operations do not preflight config and forward options to AutocaliwebApi', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).title, 'Fixture Catalog')
    assert.strictEqual((yield* version.pipe(Effect.provide(layer))).title, 'Fixture Catalog')
    assert.strictEqual((yield* stats.pipe(Effect.provide(layer))).books, 1)
    assert.strictEqual((yield* catalog.pipe(Effect.provide(layer))).records[0]?.title, 'Alphabetical Books')
    assert.strictEqual((yield* books({ limit: 3 }).pipe(Effect.provide(layer))).records[0]?.title, 'Fixture Novel One')
    assert.strictEqual((yield* recent({ limit: 2 }).pipe(Effect.provide(layer))).records[0]?.title, 'Fixture Novel Two')
    assert.strictEqual(
      (yield* search({ query: 'fixture', limit: 4 }).pipe(Effect.provide(layer))).records[0]?.title,
      'Fixture Novel One'
    )
    assert.strictEqual((yield* bookInfo({ uuid: 'book-uuid' }).pipe(Effect.provide(layer))).uuid, 'book-uuid')
    assert.strictEqual((yield* shelves.pipe(Effect.provide(layer))).records[0]?.title, 'Favorites')
    assert.deepStrictEqual(yield* Ref.get(fake.bookOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 2 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'fixture', limit: 4 }])
  })
)
