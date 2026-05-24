import { assert, it } from '@effect/vitest'
import { BookloreApi, BookloreConfig, envMissing } from '@garage/booklore'
import type { BookInfoOptions, LimitOptions, SearchOptions } from '@garage/booklore'
import { Effect, Layer, Ref } from 'effect'

import { executeBooklore } from '../src/index.js'

const ConfigLayer = Layer.succeed(BookloreConfig, {
  get: Effect.succeed({ url: 'http://booklore.example.test', username: 'fixture-user', password: 'secret' }),
})

const MissingConfigLayer = Layer.succeed(BookloreConfig, {
  get: Effect.fail(envMissing('BOOKLORE_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const bookOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const bookInfoOptions = yield* Ref.make<ReadonlyArray<BookInfoOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const api = BookloreApi.of({
    status: Effect.succeed({ current: 'development', latest: 'v0.1.0' }),
    me: Effect.succeed({ id: 1, username: 'fixture-user', email: 'user@example.test' }),
    libraries: Effect.succeed({ count: 1, records: [{ id: 1, name: 'Books', paths: [{ path: '/data/books' }] }] }),
    books: (options) =>
      Ref.update(bookOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, records: [{ id: 42, title: 'Fixture Novel One' }] })
      ),
    bookInfo: (options) =>
      Ref.update(bookInfoOptions, (records) => [...records, options]).pipe(
        Effect.as({ id: Number(options.id), title: 'Fixture Novel One' })
      ),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ query: options.query, total: 1, count: 1, records: [{ id: 42, title: 'Fixture Novel One' }] })
      ),
    shelves: Effect.succeed({ count: 1, records: [{ id: 7, name: 'Favorites' }] }),
  })
  return { layer: Layer.succeed(BookloreApi, api), bookOptions, bookInfoOptions, searchOptions }
})

it.effect('root command returns command tree and missing env remains recoverable', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const ok = yield* executeBooklore([]).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))
    const missing = yield* executeBooklore([]).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer)))

    assert.strictEqual(ok.ok, true)
    if (!ok.ok || !('health' in ok.result)) {
      assert.fail('expected root result')
    }
    assert.deepStrictEqual(ok.result.health, { configured: true, current: 'development', latest: 'v0.1.0' })
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
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    yield* executeBooklore(['books', '--limit', '3']).pipe(Effect.provide(layer))
    yield* executeBooklore(['book-info', '42']).pipe(Effect.provide(layer))
    yield* executeBooklore(['search', 'project', 'fixture', '--limit', '5']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(fake.bookOptions), [{ limit: 3 }])
    assert.deepStrictEqual(yield* Ref.get(fake.bookInfoOptions), [{ id: '42' }])
    assert.deepStrictEqual(yield* Ref.get(fake.searchOptions), [{ query: 'fixture query', limit: 5 }])
  })
)

it.effect('missing env on subcommands returns an error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeBooklore(['me']).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer)))

    assert.strictEqual(envelope.ok, false)
    if (envelope.ok) {
      assert.fail('expected error envelope')
    }
    assert.strictEqual(envelope.error.code, 'BOOKLORE_ENV_MISSING')
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    for (const args of [['status'], ['version'], ['me'], ['libraries'], ['shelves']]) {
      const envelope = yield* executeBooklore(args).pipe(Effect.provide(layer))
      assert.strictEqual(envelope.ok, true)
    }
  })
)
