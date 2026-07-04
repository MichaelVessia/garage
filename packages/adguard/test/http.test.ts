import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { AdguardApiLive, AdguardConfig, protectionToggle, queryLogSearch, stats, status } from '../src/index.js'

const ConfigLayer = Layer.succeed(AdguardConfig, {
  get: () =>
    Effect.succeed({ url: 'http://adguard.example.test/', username: 'admin', password: Redacted.make('secret') }),
})

it.effect('AdguardApiLive authenticates and maps status', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: {
        version: 'v0.107.67',
        running: true,
        protection_enabled: true,
        dns_addresses: ['192.0.2.109'],
        dns_port: 53,
      },
    }))
    const layer = AdguardApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(yield* status.pipe(Effect.provide(layer)), {
      version: 'v0.107.67',
      running: true,
      protectionEnabled: true,
      dnsAddresses: ['192.0.2.109'],
      dnsPort: 53,
      httpPort: undefined,
      protectionDisabledDuration: undefined,
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({
        method: request.method,
        url: request.url,
        authorization: Headers.get(request.raw.headers, 'authorization').pipe(Option.getOrUndefined),
      })),
      [
        {
          method: 'GET',
          url: 'http://adguard.example.test/control/status',
          authorization: 'Basic YWRtaW46c2VjcmV0',
        },
      ]
    )
  })
)

it.effect('AdguardApiLive maps stats, searches query log, and toggles protection', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((method, url) => {
      if (url.pathname === '/control/stats') {
        return {
          status: 200,
          body: {
            num_dns_queries: 100,
            num_blocked_filtering: 10,
            top_queried_domains: [{ 'example.com': 20 }],
            top_blocked_domains: [{ 'ads.example.com': 5 }],
            top_clients: [{ '192.0.2.2': 30 }],
          },
        }
      }
      if (url.pathname === '/control/querylog') {
        return {
          status: 200,
          body: {
            data: [
              {
                time: '2026-05-24T10:00:00Z',
                client: '192.0.2.2',
                question: { name: 'ads.example.com', type: 'A' },
                answer: [{ value: '0.0.0.0' }],
                status: 'NOERROR',
              },
            ],
          },
        }
      }
      if (method === 'POST') {
        return { status: 200, body: null }
      }
      return { status: 200, body: { protection_enabled: false, protection_disabled_duration: 0 } }
    })
    const layer = AdguardApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual((yield* stats.pipe(Effect.provide(layer))).topQueriedDomains[0]?.name, 'example.com')
    assert.deepStrictEqual(yield* queryLogSearch({ query: 'ads', limit: 9 }).pipe(Effect.provide(layer)), {
      count: 1,
      records: [
        {
          time: '2026-05-24T10:00:00Z',
          client: '192.0.2.2',
          question: 'ads.example.com',
          type: 'A',
          status: 'NOERROR',
          reason: undefined,
          elapsedMs: undefined,
          answer: '0.0.0.0',
        },
      ],
    })
    assert.deepStrictEqual(yield* protectionToggle({ state: 'off' }).pipe(Effect.provide(layer)), {
      protectionEnabled: false,
      protectionDisabledDuration: 0,
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [
        { method: 'GET', url: 'http://adguard.example.test/control/stats' },
        { method: 'GET', url: 'http://adguard.example.test/control/querylog?search=ads&limit=9' },
        { method: 'POST', url: 'http://adguard.example.test/control/protection' },
        { method: 'GET', url: 'http://adguard.example.test/control/status' },
      ]
    )
  })
)
