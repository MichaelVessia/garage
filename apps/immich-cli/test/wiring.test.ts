import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { ImmichApiLive, ImmichConfig } from '@garage/immich'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeImmich } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_, url) =>
      url.pathname === '/api/server/version'
        ? { status: 200, body: { major: 2, minor: 5, patch: 6 } }
        : { status: 200, body: { res: 'pong' } }
    )
    const config = Layer.succeed(ImmichConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://immich.example.test/',
          apiKey: Redacted.make('recording-secret'),
        }),
    })
    const layer = ImmichApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeImmich(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'immich status',
      result: {
        version: '2.5.6',
        versionParts: { major: 2, minor: 5, patch: 6 },
        ping: 'pong',
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 2)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        accept: Headers.get(request.raw.headers, 'accept').pipe(Option.getOrUndefined),
        apiKey: Headers.get(request.raw.headers, 'x-api-key').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://immich.example.test/api/server/version',
          accept: 'application/json',
          apiKey: 'recording-secret',
        },
        {
          method: 'GET',
          url: 'http://immich.example.test/api/server/ping',
          accept: 'application/json',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
