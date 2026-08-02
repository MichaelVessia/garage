import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { ProwlarrApiLive, ProwlarrConfig } from '@garage/prowlarr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeProwlarr } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        appName: 'Prowlarr',
        version: '1.30.2',
        instanceName: 'Prowlarr',
        branch: 'main',
        runtimeVersion: '8.0.0',
        osName: 'linux',
      },
    }))
    const config = Layer.succeed(ProwlarrConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://prowlarr.example.test/',
          apiKey: Redacted.make('recording-secret'),
        }),
    })
    const layer = ProwlarrApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeProwlarr(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'prowlarr status',
      result: {
        appName: 'Prowlarr',
        version: '1.30.2',
        instanceName: 'Prowlarr',
        branch: 'main',
        runtimeVersion: '8.0.0',
        osName: 'linux',
        osVersion: undefined,
        buildTime: undefined,
        isLinux: undefined,
        isProduction: undefined,
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
          url: 'http://prowlarr.example.test/api/v1/system/status',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
