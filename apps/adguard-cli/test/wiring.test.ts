import { assert, it } from '@effect/vitest'
import { AdguardApiLive, AdguardConfig } from '@garage/adguard'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { executeAdguard } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        version: 'v0.107.67',
        running: true,
        protection_enabled: true,
        dns_addresses: ['192.0.2.109'],
        dns_port: 53,
        http_port: 3000,
        protection_disabled_duration: 0,
      },
    }))
    const config = Layer.succeed(AdguardConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://adguard.example.test/',
          username: 'recording-admin',
          password: Redacted.make('recording-secret'),
        }),
    })
    const layer = AdguardApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeAdguard(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'adguard status',
      result: {
        version: 'v0.107.67',
        running: true,
        protectionEnabled: true,
        dnsAddresses: ['192.0.2.109'],
        dnsPort: 53,
        httpPort: 3000,
        protectionDisabledDuration: 0,
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
          url: 'http://adguard.example.test/control/status',
          authorization: 'Basic cmVjb3JkaW5nLWFkbWluOnJlY29yZGluZy1zZWNyZXQ=',
        },
      ]
    )
  })
)
