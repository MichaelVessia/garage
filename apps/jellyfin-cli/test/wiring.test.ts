import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { JellyfinApiLive, JellyfinConfig } from '@garage/jellyfin'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeJellyfin } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        ServerName: 'Jellyfin',
        Version: '10.10.7',
        Id: 'recording-server',
        OperatingSystem: 'Linux',
        ProductName: 'Jellyfin Server',
        LocalAddress: 'http://192.0.2.109:8096',
      },
    }))
    const config = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('recording-secret'),
        }),
    })
    const layer = JellyfinApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeJellyfin(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'jellyfin status',
      result: {
        serverName: 'Jellyfin',
        version: '10.10.7',
        id: 'recording-server',
        operatingSystem: 'Linux',
        productName: 'Jellyfin Server',
        localAddress: 'http://192.0.2.109:8096',
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 1)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        token: Headers.get(request.raw.headers, 'x-emby-token').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://jellyfin.example.test/System/Info',
          token: 'recording-secret',
        },
      ]
    )
  })
)
