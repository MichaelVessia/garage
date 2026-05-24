import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'

import {
  BookloreApi,
  BookloreConfig,
  bookInfo,
  books,
  libraries,
  me,
  search,
  shelves,
  status,
  version,
} from '../src/index.js'
import type { BookInfoOptions, LimitOptions, SearchOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(BookloreConfig, {
  get: Effect.succeed({ url: 'http://booklore.example.test', username: 'fixture-user', password: 'secret' }),
})

const makeApiLayer = Effect.gen(function* () {
  const bookOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const bookInfoOptions = yield* Ref.make<ReadonlyArray<BookInfoOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const api = BookloreApi.of({
    status: Effect.succeed({ current: 'development', latest: 'v0.1.0' }),
    me: Effect.succeed({ id: 1, username: 'fixture-user', email: 'user@example.test' }),
    libraries: Effect.succeed({
      count: 1,
      records: [{ id: 1, name: 'Books', paths: [{ id: 11, path: '/data/books' }] }],
    }),
    books: (options) =>
      Ref.update(bookOptions, (records) => [...records, options]).pipe(
        Effect.as({
          count: 1,
          records: [{ id: 42, title: 'Fixture Novel One', authors: ['Fixture Author'], libraryId: 1 }],
        })
      ),
    bookInfo: (options) =>
      Ref.update(bookInfoOptions, (records) => [...records, options]).pipe(
        Effect.as({ id: Number(options.id), title: 'Fixture Novel One', authors: ['Fixture Author'], libraryId: 1 })
      ),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({
          query: options.query,
          total: 1,
          count: 1,
          records: [{ id: 42, title: 'Fixture Novel One', authors: ['Fixture Author'], libraryId: 1 }],
        })
      ),
    shelves: Effect.succeed({ count: 1, records: [{ id: 7, name: 'Favorites' }] }),
  })
  return { layer: Layer.succeed(BookloreApi, api), bookOptions, bookInfoOptions, searchOptions }
})

it.effect('runs BookLore read operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).current, 'development')
    assert.strictEqual((yield* version.pipe(Effect.provide(layer))).latest, 'v0.1.0')
    assert.strictEqual((yield* me.pipe(Effect.provide(layer))).username, 'fixture-user')
    assert.strictEqual((yield* libraries.pipe(Effect.provide(layer))).records[0]?.name, 'Books')
    assert.strictEqual((yield* books({ limit: 3 }).pipe(Effect.provide(layer))).records[0]?.title, 'Fixture Novel One')
    assert.strictEqual((yield* bookInfo({ id: '42' }).pipe(Effect.provide(layer))).id, 42)
    assert.strictEqual((yield* search({ query: 'fixture', limit: 4 }).pipe(Effect.provide(layer))).records[0]?.id, 42)
    assert.strictEqual((yield* shelves.pipe(Effect.provide(layer))).records[0]?.name, 'Favorites')
    assert.deepStrictEqual(yield* Ref.get(fake.bookOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.bookInfoOptions), [{ id: '42' }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'fixture', limit: 4 }])
  })
)
