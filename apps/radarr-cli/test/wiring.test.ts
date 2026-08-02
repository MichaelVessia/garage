import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { RadarrApiLive, RadarrConfig } from '@garage/radarr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeRadarr } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        appName: 'Radarr',
        version: '5.0.0',
        branch: 'main',
        runtimeVersion: '8.0.0',
      },
    }))
    const config = Layer.succeed(RadarrConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://radarr.example.test/',
          apiKey: Redacted.make('recording-secret'),
          defaultQualityProfileId: 1,
        }),
    })
    const api = RadarrApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))
    const layer = Layer.mergeAll(config, api)

    const envelope = yield* executeRadarr(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'radarr status',
      result: {
        appName: 'Radarr',
        version: '5.0.0',
        instanceName: undefined,
        branch: 'main',
        runtimeVersion: '8.0.0',
        startupPath: undefined,
        appData: undefined,
        osName: undefined,
        osVersion: undefined,
        isLinux: undefined,
        isDocker: undefined,
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
          url: 'http://radarr.example.test/api/v3/system/status',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
