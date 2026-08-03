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

it.effect('renders an invalid configured media user as an actionable represented failure', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [{ Id: 'admin', Name: 'Administrator', Policy: { IsAdministrator: true, IsDisabled: false } }],
          }
        : { status: 200, body: { Items: [] } }
    )
    const config = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('recording-secret'),
          userId: 'missing',
        }),
    })
    const layer = JellyfinApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeJellyfin(['item-search', 'Linux']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'jellyfin item-search Linux',
      error: {
        code: 'JELLYFIN_USER_ID_INVALID',
        message: 'Configured Jellyfin user missing was not found',
      },
      fix: 'Set JELLYFIN_USER_ID to the ID of an enabled Jellyfin user. Run jellyfin users to inspect user IDs and policy state.',
      next_actions: [
        {
          command: 'jellyfin users',
          description: 'List users and choose an enabled user ID for JELLYFIN_USER_ID',
        },
      ],
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('renders zero enabled administrators as an actionable represented failure', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [
              { Id: 'viewer', Name: 'Viewer', Policy: { IsAdministrator: false, IsDisabled: false } },
              { Id: 'disabled-admin', Policy: { IsAdministrator: true, IsDisabled: true } },
            ],
          }
        : { status: 200, body: [] }
    )
    const config = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('recording-secret'),
        }),
    })
    const layer = JellyfinApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeJellyfin(['recently-added']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'jellyfin recently-added',
      error: {
        code: 'JELLYFIN_NO_ENABLED_ADMINISTRATOR',
        message: 'No enabled Jellyfin administrator is available for media visibility',
      },
      fix: 'Set JELLYFIN_USER_ID to an enabled Jellyfin user ID, or enable exactly one Jellyfin administrator.',
      next_actions: [
        {
          command: 'jellyfin users',
          description: 'List users and choose an enabled user ID for JELLYFIN_USER_ID',
        },
      ],
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('renders ambiguous media visibility as an actionable represented failure', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [
              { Id: 'admin-2', Name: 'Administrator 2', Policy: { IsAdministrator: true, IsDisabled: false } },
              { Id: 'admin-1', Name: 'Administrator 1', Policy: { IsAdministrator: true, IsDisabled: false } },
            ],
          }
        : { status: 200, body: [] }
    )
    const config = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('recording-secret'),
        }),
    })
    const layer = JellyfinApiLive.pipe(Layer.provide(Layer.mergeAll(config, fake.layer)))

    const envelope = yield* executeJellyfin(['recently-added']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'jellyfin recently-added',
      error: {
        code: 'JELLYFIN_AMBIGUOUS_ADMINISTRATOR',
        message: 'Multiple enabled Jellyfin administrators are available for media visibility',
      },
      fix: 'Set JELLYFIN_USER_ID to the enabled Jellyfin user whose media visibility should be used.',
      next_actions: [
        {
          command: 'jellyfin users',
          description: 'List users and choose an enabled user ID for JELLYFIN_USER_ID',
        },
      ],
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)
