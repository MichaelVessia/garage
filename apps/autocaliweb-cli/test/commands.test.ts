import { assert, it } from '@effect/vitest'
import { AutocaliwebApi, AutocaliwebConfig, envMissing } from '@garage/autocaliweb'
import type { LimitOptions, SearchOptions } from '@garage/autocaliweb'
import { Effect, Layer, Ref } from 'effect'

import { executeAutocaliweb } from '../src/index.js'

const ConfigLayer = Layer.succeed(AutocaliwebConfig, {
  get: Effect.succeed({ url: 'http://autocaliweb.example.test', username: 'fixture-user', password: 'secret' }),
})

const MissingConfigLayer = Layer.succeed(AutocaliwebConfig, { get: Effect.fail(envMissing('AUTOCALIWEB_URL')) })

const makeApiLayer = Effect.gen(function* () {
  const bookOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const recentOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const bookInfoOptions = yield* Ref.make<ReadonlyArray<string>>([])
  const api = AutocaliwebApi.of({
    status: Effect.succeed({
      title: 'Fixture Catalog',
      updated: '2026-05-24T10:00:00+00:00',
      catalogCount: 1,
      stats: { books: 1, authors: 1, categories: 1, series: 0 },
    }),
    stats: Effect.succeed({ books: 1, authors: 1, categories: 1, series: 0 }),
    catalog: Effect.succeed({ count: 1, records: [{ title: 'Alphabetical Books', href: '/opds/books' }] }),
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
      Ref.update(bookInfoOptions, (records) => [...records, options.uuid]).pipe(
        Effect.as({
          id: '42',
          uuid: options.uuid,
          authors: [],
          languages: [],
          categories: [],
          downloads: [],
          formats: [],
          tags: [],
        })
      ),
    shelves: Effect.succeed({ count: 1, records: [{ title: 'Favorites', href: '/opds/shelf/1' }] }),
  })
  return { layer: Layer.succeed(AutocaliwebApi, api), bookOptions, recentOptions, searchOptions, bookInfoOptions }
})

it.effect('root reports command tree and health', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)
    const envelope = yield* executeAutocaliweb([]).pipe(Effect.provide(layer))

    assert.strictEqual(envelope.ok, true)
    if (envelope.ok && 'name' in envelope.result) {
      assert.strictEqual(envelope.result.name, 'autocaliweb')
      assert.deepStrictEqual(envelope.result.health, { configured: true, title: 'Fixture Catalog', books: 1 })
    } else {
      assert.fail('expected root result')
    }

    const missing = yield* executeAutocaliweb([]).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer)))
    assert.strictEqual(missing.ok, true)
    if (missing.ok && 'health' in missing.result) {
      assert.deepStrictEqual(missing.result.health, { configured: false })
    } else {
      assert.fail('expected root result')
    }
  })
)

it.effect('bounded commands pass limits, search args, and book UUIDs', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    yield* executeAutocaliweb(['books', '--limit', '3']).pipe(Effect.provide(layer))
    yield* executeAutocaliweb(['recent', '--limit', '2']).pipe(Effect.provide(layer))
    yield* executeAutocaliweb(['search', 'fixture', 'query', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeAutocaliweb(['book-info', 'uuid-one']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.bookOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.recentOptions), [{ limit: 2 }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'fixture query', limit: 5 }])
    assert.deepStrictEqual(yield* Ref.get(fake.bookInfoOptions), ['uuid-one'])
  })
)

it.effect('usage errors return an error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)
    const envelope = yield* executeAutocaliweb(['search']).pipe(Effect.provide(layer))

    assert.strictEqual(envelope.ok, false)
    if (!envelope.ok) {
      assert.strictEqual(envelope.error.code, 'AUTOCALIWEB_CLI_USAGE')
      assert.strictEqual(envelope.error.message, 'query is required')
    }
  })
)
