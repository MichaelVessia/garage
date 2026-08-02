import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { SonarrApiLive, SonarrConfig } from '@garage/sonarr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeSonarr } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        appName: 'Sonarr',
        version: '4.0.0',
      },
    }))
    const config = Layer.succeed(SonarrConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://sonarr.example.test/',
          apiKey: Redacted.make('recording-secret'),
          defaultQualityProfileId: 1,
        }),
    })
    const layer = SonarrApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeSonarr(['status']).pipe(Effect.provide(Layer.mergeAll(config, layer)))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'sonarr status',
      result: {
        appName: 'Sonarr',
        version: '4.0.0',
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
          url: 'http://sonarr.example.test/api/v3/system/status',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
