import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/integration-http/testing'
import type { RecordedHttpRequest, RecordingHttpResponse } from '@garage/integration-http/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import type * as Schema from 'effect/Schema'
import { Headers as HttpHeaders } from 'effect/unstable/http'

import { AutocaliwebApiLive, AutocaliwebConfig, bookInfo, books, catalog, search, status } from '../src/index.js'

const ConfigLayer = Layer.succeed(AutocaliwebConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://autocaliweb.example.test/',
      username: 'fixture-user',
      password: Redacted.make('secret'),
    }),
})

const basicAuth = `Basic ${btoa('fixture-user:secret')}`

const atomResponse = (body: string): RecordingHttpResponse => ({
  status: 200,
  body,
  headers: new Headers({ 'content-type': 'application/atom+xml' }),
})

const jsonResponse = (body: Schema.JsonObject): RecordingHttpResponse => ({
  status: 200,
  body: JSON.stringify(body),
  headers: new Headers({ 'content-type': 'application/json' }),
})

const withAuth = (records: ReadonlyArray<RecordedHttpRequest>) =>
  records.map((request) => ({
    method: request.method,
    url: request.url,
    authorization: HttpHeaders.get(request.raw.headers, 'authorization').pipe(Option.getOrUndefined),
    accept: HttpHeaders.get(request.raw.headers, 'accept').pipe(Option.getOrUndefined),
  }))

const indexFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Fixture Catalog</title>
  <updated>2026-05-24T10:00:00+00:00</updated>
  <entry>
    <title>Alphabetical Books</title>
    <id>/opds/books</id>
    <link href="/opds/books" type="application/atom+xml;profile=opds-catalog"/>
    <content type="text">Books sorted alphabetically</content>
  </entry>
  <entry>
    <title>Shelves</title>
    <id>/opds/shelfindex</id>
    <link href="/opds/shelfindex" type="application/atom+xml;profile=opds-catalog"/>
  </entry>
</feed>`

const bookEntry = (id: string, uuid: string, title: string): string => `<entry>
  <title>${title}</title>
  <id>urn:uuid:${uuid}</id>
  <updated>2026-05-24T10:00:00+00:00</updated>
  <author><name>Fixture Author</name></author>
  <published>2026-01-01T00:00:00+00:00</published>
  <dcterms:language>eng</dcterms:language>
  <category term="Fiction" label="Fiction"/>
  <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Fixture summary</div></content>
  <link type="image/jpeg" href="/opds/cover/${id}" rel="http://opds-spec.org/image"/>
  <link rel="http://opds-spec.org/acquisition" href="/opds/download/${id}/epub/" length="123" title="EPUB" type="application/epub+zip"/>
</entry>`

const feedWithEntries = (entries: string, next = ''): string => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/">
  <title>Fixture Catalog</title>
  ${next}
  ${entries}
</feed>`

const firstBooksPage = feedWithEntries(
  bookEntry('42', 'uuid-one', 'Fixture Novel One'),
  '<link rel="next" href="/opds/books/letter/00?offset=1" type="application/atom+xml"/>'
)

const secondBooksPage = feedWithEntries(bookEntry('43', 'uuid-two', 'Fixture Novel Two'))

const searchFeed = feedWithEntries(
  `${bookEntry('42', 'uuid-one', 'Fixture Novel One')}${bookEntry('43', 'uuid-two', 'Fixture Novel Two')}`
)

it.effect('AutocaliwebApiLive authenticates OPDS reads and returns status', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, url) => {
      if (method === 'GET' && url.pathname === '/opds/stats') {
        return jsonResponse({ books: 2, authors: 1, categories: 1, series: 0 })
      }
      return atomResponse(indexFeed)
    })
    const layer = AutocaliwebApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* status, {
        title: 'Fixture Catalog',
        updated: '2026-05-24T10:00:00+00:00',
        catalogCount: 2,
        stats: { books: 2, authors: 1, categories: 1, series: 0 },
      })
      assert.deepStrictEqual(yield* catalog, {
        count: 2,
        records: [
          {
            title: 'Alphabetical Books',
            id: '/opds/books',
            href: 'http://autocaliweb.example.test/opds/books',
            content: 'Books sorted alphabetically',
          },
          {
            title: 'Shelves',
            id: '/opds/shelfindex',
            href: 'http://autocaliweb.example.test/opds/shelfindex',
            content: undefined,
          },
        ],
      })
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(withAuth(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://autocaliweb.example.test/opds',
        authorization: basicAuth,
        accept: 'application/atom+xml',
      },
      {
        method: 'GET',
        url: 'http://autocaliweb.example.test/opds/stats',
        authorization: basicAuth,
        accept: 'application/json',
      },
      {
        method: 'GET',
        url: 'http://autocaliweb.example.test/opds',
        authorization: basicAuth,
        accept: 'application/atom+xml',
      },
    ])
  })
)

it.effect('AutocaliwebApiLive normalizes books, pagination, search, and metadata JSON', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, url) => {
      if (method === 'GET' && url.pathname === '/opds/books/letter/00' && url.searchParams.get('offset') === '1') {
        return atomResponse(secondBooksPage)
      }
      if (method === 'GET' && url.pathname === '/opds/books/letter/00') {
        return atomResponse(firstBooksPage)
      }
      if (method === 'GET' && url.pathname === '/opds/search') {
        return atomResponse(searchFeed)
      }
      if (method === 'GET' && url.pathname === '/ajax/book/uuid-one') {
        return jsonResponse({
          pubdate: '2026-01-01 00:00:00+00:00',
          title: 'Fixture Novel One',
          formats: ['EPUB'],
          languages: ['eng'],
          comments: 'Fixture summary',
          tags: ['Fiction'],
          application_id: 42,
          last_modified: '2026-05-24 10:00:00+00:00',
          author_sort: 'Fixture Author',
          uuid: 'uuid-one',
          rating: '0.0',
          authors: ['Fixture Author'],
          title_sort: 'Fixture Novel One',
          main_format: { epub: '/opds/download/42/epub/' },
          other_formats: {},
        })
      }
      return atomResponse(indexFeed)
    })
    const layer = AutocaliwebApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* books({ limit: 2 }), {
        count: 2,
        records: [
          {
            id: '42',
            uuid: 'uuid-one',
            urn: 'urn:uuid:uuid-one',
            title: 'Fixture Novel One',
            authors: ['Fixture Author'],
            published: '2026-01-01T00:00:00+00:00',
            updated: '2026-05-24T10:00:00+00:00',
            languages: ['eng'],
            categories: ['Fiction'],
            summary: 'Fixture summary',
            coverHref: 'http://autocaliweb.example.test/opds/cover/42',
            downloads: [
              {
                href: 'http://autocaliweb.example.test/opds/download/42/epub/',
                format: 'EPUB',
                mediaType: 'application/epub+zip',
                size: 123,
              },
            ],
          },
          {
            id: '43',
            uuid: 'uuid-two',
            urn: 'urn:uuid:uuid-two',
            title: 'Fixture Novel Two',
            authors: ['Fixture Author'],
            published: '2026-01-01T00:00:00+00:00',
            updated: '2026-05-24T10:00:00+00:00',
            languages: ['eng'],
            categories: ['Fiction'],
            summary: 'Fixture summary',
            coverHref: 'http://autocaliweb.example.test/opds/cover/43',
            downloads: [
              {
                href: 'http://autocaliweb.example.test/opds/download/43/epub/',
                format: 'EPUB',
                mediaType: 'application/epub+zip',
                size: 123,
              },
            ],
          },
        ],
      })
      assert.deepStrictEqual(yield* search({ query: 'fixture query', limit: 1 }), {
        query: 'fixture query',
        total: 2,
        count: 1,
        records: [
          {
            id: '42',
            uuid: 'uuid-one',
            urn: 'urn:uuid:uuid-one',
            title: 'Fixture Novel One',
            authors: ['Fixture Author'],
            published: '2026-01-01T00:00:00+00:00',
            updated: '2026-05-24T10:00:00+00:00',
            languages: ['eng'],
            categories: ['Fiction'],
            summary: 'Fixture summary',
            coverHref: 'http://autocaliweb.example.test/opds/cover/42',
            downloads: [
              {
                href: 'http://autocaliweb.example.test/opds/download/42/epub/',
                format: 'EPUB',
                mediaType: 'application/epub+zip',
                size: 123,
              },
            ],
          },
        ],
      })
      assert.deepStrictEqual(yield* bookInfo({ uuid: 'uuid-one' }), {
        id: '42',
        uuid: 'uuid-one',
        urn: 'urn:uuid:uuid-one',
        title: 'Fixture Novel One',
        authors: ['Fixture Author'],
        published: '2026-01-01 00:00:00+00:00',
        languages: ['eng'],
        categories: ['Fiction'],
        summary: 'Fixture summary',
        downloads: [{ format: 'epub', href: '/opds/download/42/epub/' }],
        formats: ['EPUB'],
        tags: ['Fiction'],
        rating: '0.0',
        lastModified: '2026-05-24 10:00:00+00:00',
        authorSort: 'Fixture Author',
        titleSort: 'Fixture Novel One',
      })
    }).pipe(Effect.provide(layer))
  })
)

it.effect('preserves a configured base-path prefix for OPDS requests', () =>
  Effect.gen(function* () {
    const prefixedConfigLayer = Layer.succeed(AutocaliwebConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://autocaliweb.example.test/calibre-web/',
          username: 'fixture-user',
          password: Redacted.make('secret'),
        }),
    })
    const fake = yield* makeRecordingHttpClient(() => atomResponse(secondBooksPage))
    const layer = AutocaliwebApiLive.pipe(Layer.provideMerge(Layer.mergeAll(prefixedConfigLayer, fake.layer)))

    yield* books({ limit: 1 }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(withAuth(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://autocaliweb.example.test/calibre-web/opds/books/letter/00',
        authorization: basicAuth,
        accept: 'application/atom+xml',
      },
    ])
  })
)

it.effect('rejects cross-origin OPDS pagination before forwarding Basic auth', () =>
  Effect.gen(function* () {
    const hostileFeed = feedWithEntries(
      bookEntry('42', 'uuid-one', 'Fixture Novel One'),
      '<link rel="next" href="https://attacker.example.test/opds/books" type="application/atom+xml"/>'
    )
    const fake = yield* makeRecordingHttpClient(() => atomResponse(hostileFeed))
    const layer = AutocaliwebApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const failure = yield* books({ limit: 2 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(failure.code, 'AUTOCALIWEB_DECODE_ERROR')
    assert.strictEqual((yield* Ref.get(fake.requests)).length, 1)
    assert.deepStrictEqual(withAuth(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://autocaliweb.example.test/opds/books/letter/00',
        authorization: basicAuth,
        accept: 'application/atom+xml',
      },
    ])
  })
)
