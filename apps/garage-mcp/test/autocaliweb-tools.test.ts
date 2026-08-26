import { assert, it } from '@effect/vitest'
import { AutocaliwebApi } from '@garage/autocaliweb'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Stream from 'effect/Stream'

import { AutocaliwebToolkit, AutocaliwebToolkitHandlers } from '../src/tools/autocaliweb.js'

const book = {
  uuid: 'fixture-uuid',
  title: 'Fixture Book',
  authors: ['Fixture Author'],
  languages: ['eng'],
  categories: ['Fiction'],
  downloads: [],
}

const makeApiLayer = Effect.gen(function* () {
  const calls = yield* Ref.make<ReadonlyArray<string>>([])
  const record = (call: string) => Ref.update(calls, (current) => [...current, call])
  const api = AutocaliwebApi.of({
    status: () =>
      record('status').pipe(Effect.as({ catalogCount: 2, stats: { books: 1, authors: 1, categories: 1, series: 0 } })),
    stats: () => record('stats').pipe(Effect.as({ books: 1, authors: 1, categories: 1, series: 0 })),
    catalog: () => record('catalog').pipe(Effect.as({ count: 1, records: [{ title: 'Books' }] })),
    books: ({ limit }) => record(`books:${limit}`).pipe(Effect.as({ count: 1, records: [book] })),
    recent: ({ limit }) => record(`recent:${limit}`).pipe(Effect.as({ count: 1, records: [book] })),
    search: ({ query, limit }) =>
      record(`search:${query}:${limit}`).pipe(Effect.as({ query, total: 1, count: 1, records: [book] })),
    bookInfo: ({ uuid }) =>
      record(`bookInfo:${uuid}`).pipe(Effect.as({ ...book, uuid, formats: ['EPUB'], tags: ['Fiction'] })),
    shelves: () => record('shelves').pipe(Effect.as({ count: 1, records: [{ title: 'Favorites' }] })),
  })

  return { layer: Layer.succeed(AutocaliwebApi, api), calls }
})

it.effect('adapts every API/catalog tool to the AutoCaliWeb package operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const toolkit = yield* AutocaliwebToolkit.pipe(Effect.provide(AutocaliwebToolkitHandlers))

    const statusResults = yield* toolkit
      .handle('autocaliweb_status', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const versionResults = yield* toolkit
      .handle('autocaliweb_version', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const statsResults = yield* toolkit
      .handle('autocaliweb_stats', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    yield* toolkit.handle('autocaliweb_catalog', {}).pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    yield* toolkit
      .handle('autocaliweb_books', { limit: 5 })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    yield* toolkit
      .handle('autocaliweb_recent', { limit: 6 })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const searchResults = yield* toolkit
      .handle('autocaliweb_search', { query: 'fixture', limit: 7 })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const infoResults = yield* toolkit
      .handle('autocaliweb_book_info', { uuid: 'fixture-uuid' })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    yield* toolkit.handle('autocaliweb_shelves', {}).pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))

    assert.deepStrictEqual(statusResults[0]?.encodedResult, {
      catalogCount: 2,
      stats: { books: 1, authors: 1, categories: 1, series: 0 },
    })
    assert.deepStrictEqual(versionResults[0]?.encodedResult, statusResults[0]?.encodedResult)
    assert.deepStrictEqual(statsResults[0]?.encodedResult, {
      books: 1,
      authors: 1,
      categories: 1,
      series: 0,
    })
    assert.deepInclude(searchResults[0]?.encodedResult, { query: 'fixture', count: 1 })
    assert.deepInclude(infoResults[0]?.encodedResult, { uuid: 'fixture-uuid', formats: ['EPUB'] })
    assert.deepStrictEqual(yield* Ref.get(fake.calls), [
      'status',
      'status',
      'stats',
      'catalog',
      'books:5',
      'recent:6',
      'search:fixture:7',
      'bookInfo:fixture-uuid',
      'shelves',
    ])
  })
)
