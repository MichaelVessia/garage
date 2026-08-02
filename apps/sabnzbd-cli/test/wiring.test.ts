import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import { SabnzbdApiLive, SabnzbdConfig } from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import { executeSabnzbd } from '../src/index.js'

it.effect('executes status through the live API layer', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        status: {
          version: '4.5.3',
          uptime: '1d',
          paused: false,
          paused_all: false,
          speedlimit: '0',
          speedlimit_abs: '0',
          diskspace1_norm: '1 TB',
          have_warnings: false,
          warnings: [],
        },
      },
    }))
    const config = Layer.succeed(SabnzbdConfig, {
      get: () => Effect.succeed({ url: 'http://sabnzbd.example.test/', apiKey: Redacted.make('recording-secret') }),
    })
    const layer = SabnzbdApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeSabnzbd(['status']).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'sabnzbd status',
      result: {
        version: '4.5.3',
        uptime: '1d',
        paused: false,
        pausedAll: false,
        speedlimit: '0',
        speedlimitAbs: '0',
        diskspace1Norm: '1 TB',
        diskspace2Norm: undefined,
        haveWarnings: false,
        warnings: [],
        newRelease: undefined,
      },
      next_actions: [],
    })
    assert.strictEqual(requests.length, 1)
    assert.deepStrictEqual(
      requests.map((request) => ({
        method: request.method,
        url: request.url,
        apiKey: new URL(request.url).searchParams.get('apikey'),
      })),
      [
        {
          method: 'GET',
          url: 'http://sabnzbd.example.test/api?apikey=recording-secret&output=json&mode=fullstatus',
          apiKey: 'recording-secret',
        },
      ]
    )
  })
)
