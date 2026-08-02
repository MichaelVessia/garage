import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { JellyseerrApiLive, JellyseerrConfig } from '@garage/jellyseerr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeJellyseerr } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        version: '2.0.0',
        commitTag: 'v2.0.0',
        updateAvailable: false,
        commitsBehind: 0,
        restartRequired: false,
      },
    }))
    const config = Layer.succeed(JellyseerrConfig, {
      get: () => Effect.succeed({ url: 'http://jellyseerr.example.test/', apiKey: Redacted.make('recording-secret') }),
    })
    const layer = JellyseerrApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeJellyseerr(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'jellyseerr status',
      result: {
        version: '2.0.0',
        commitTag: 'v2.0.0',
        updateAvailable: false,
        commitsBehind: 0,
        restartRequired: false,
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 1)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        apiKey: Headers.get(request.raw.headers, 'x-api-key').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://jellyseerr.example.test/api/v1/status',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
