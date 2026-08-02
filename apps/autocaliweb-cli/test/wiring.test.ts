import { assert, it } from '@effect/vitest'
import { AutocaliwebApiLive, AutocaliwebConfig } from '@garage/autocaliweb'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeAutocaliweb } from '../src/index.js'

it.effect('executes book-info through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        application_id: 42,
        uuid: 'book-uuid',
        title: 'Fixture Novel',
        authors: ['Fixture Author'],
        formats: ['EPUB'],
        languages: ['eng'],
        tags: ['Fiction'],
        rating: 5,
      },
    }))
    const config = Layer.succeed(AutocaliwebConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://autocaliweb.example.test/',
          username: 'recording-user',
          password: Redacted.make('recording-secret'),
        }),
    })
    const layer = AutocaliwebApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeAutocaliweb(['book-info', 'book-uuid']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'autocaliweb book-info book-uuid',
      result: {
        id: '42',
        uuid: 'book-uuid',
        urn: 'urn:uuid:book-uuid',
        title: 'Fixture Novel',
        authors: ['Fixture Author'],
        published: undefined,
        languages: ['eng'],
        categories: ['Fiction'],
        summary: undefined,
        downloads: [],
        formats: ['EPUB'],
        tags: ['Fiction'],
        rating: '5',
        lastModified: undefined,
        authorSort: undefined,
        titleSort: undefined,
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 1)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        authorization: Headers.get(request.raw.headers, 'authorization').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://autocaliweb.example.test/ajax/book/book-uuid',
          authorization: `Basic ${btoa('recording-user:recording-secret')}`,
        },
      ]
    )
  })
)
