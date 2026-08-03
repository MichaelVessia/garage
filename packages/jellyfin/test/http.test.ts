import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers } from 'effect/unstable/http'

import { JellyfinApiLive, JellyfinConfig, itemSearch, recentlyAdded, runTask, status } from '../src/index.js'

const ConfigLayer = Layer.succeed(JellyfinConfig, {
  get: () => Effect.succeed({ url: 'http://jellyfin.example.test/', apiKey: Redacted.make('secret') }),
})

it.effect('JellyfinApiLive authenticates and maps status', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({
      status: 200,
      body: { ServerName: 'Jellyfin', Version: '10.10.7' },
    }))
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual((yield* status.pipe(Effect.provide(layer))).version, '10.10.7')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({
        method: request.method,
        url: request.url,
        token: Headers.get(request.raw.headers, 'x-emby-token').pipe(Option.getOrUndefined),
      })),
      [{ method: 'GET', url: 'http://jellyfin.example.test/System/Info', token: 'secret' }]
    )
  })
)

it.effect('JellyfinApiLive selects the sole enabled administrator independently of user ordering', () =>
  Effect.gen(function* () {
    const administrator = {
      Id: 'admin',
      Name: 'Administrator',
      Policy: { IsAdministrator: true, IsDisabled: false },
    }
    const viewer = { Id: 'viewer', Name: 'Viewer', Policy: { IsAdministrator: false, IsDisabled: false } }

    yield* Effect.forEach(
      [
        [viewer, administrator],
        [administrator, viewer],
      ],
      (users) =>
        Effect.gen(function* () {
          const fake = yield* makeRecordingHttpClient((_method, url) => {
            if (url.pathname === '/Users') {
              return { status: 200, body: users }
            }
            return url.pathname.endsWith('/Items/Latest')
              ? { status: 200, body: [{ Id: 'i1', Name: 'Latest Linux ISO', Type: 'Movie' }] }
              : { status: 200, body: { Items: [{ Id: 'i2', Name: 'Search Linux ISO', Type: 'Movie' }] } }
          })
          const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

          assert.strictEqual(
            (yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.name,
            'Latest Linux ISO'
          )
          assert.strictEqual(
            (yield* itemSearch({ query: 'Linux', limit: 4 }).pipe(Effect.provide(layer))).records[0]?.name,
            'Search Linux ISO'
          )
          assert.deepStrictEqual(
            (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
            ['/Users', '/Users/admin/Items/Latest', '/Users', '/Users/admin/Items']
          )
        })
    )
  })
)

it.effect('JellyfinApiLive honors a configured enabled user for both media endpoints', () =>
  Effect.gen(function* () {
    const configuredUserLayer = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('secret'),
          userId: 'viewer',
        }),
    })
    const fake = yield* makeRecordingHttpClient((_method, url) => {
      if (url.pathname === '/Users') {
        return {
          status: 200,
          body: [
            { Id: 'admin', Name: 'Administrator', Policy: { IsAdministrator: true, IsDisabled: false } },
            { Id: 'viewer', Name: 'Viewer', Policy: { IsAdministrator: false, IsDisabled: false } },
          ],
        }
      }
      return url.pathname.endsWith('/Items/Latest')
        ? { status: 200, body: [{ Id: 'i1', Name: 'Latest Linux ISO', Type: 'Movie' }] }
        : { status: 200, body: { Items: [{ Id: 'i2', Name: 'Search Linux ISO', Type: 'Movie' }] } }
    })
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(configuredUserLayer, fake.layer)))

    assert.strictEqual(
      (yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer))).records[0]?.name,
      'Latest Linux ISO'
    )
    assert.strictEqual(
      (yield* itemSearch({ query: 'Linux', limit: 4 }).pipe(Effect.provide(layer))).records[0]?.name,
      'Search Linux ISO'
    )
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users', '/Users/viewer/Items/Latest', '/Users', '/Users/viewer/Items']
    )
  })
)

it.effect('JellyfinApiLive rejects a missing configured user before requesting media', () =>
  Effect.gen(function* () {
    const configuredUserLayer = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('secret'),
          userId: 'missing',
        }),
    })
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [{ Id: 'admin', Name: 'Administrator', Policy: { IsAdministrator: true, IsDisabled: false } }],
          }
        : { status: 200, body: [{ Id: 'i1', Name: 'Linux ISO', Type: 'Movie' }] }
    )
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(configuredUserLayer, fake.layer)))

    const error = yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'JellyfinConfiguredUserError')
    assert.strictEqual(error.code, 'JELLYFIN_USER_ID_INVALID')
    assert.strictEqual(error.message, 'Configured Jellyfin user missing was not found')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('JellyfinApiLive rejects a disabled configured user before requesting media', () =>
  Effect.gen(function* () {
    const configuredUserLayer = Layer.succeed(JellyfinConfig, {
      get: () =>
        Effect.succeed({
          url: 'http://jellyfin.example.test/',
          apiKey: Redacted.make('secret'),
          userId: 'disabled',
        }),
    })
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [
              { Id: 'disabled', Name: 'Disabled', Policy: { IsAdministrator: true, IsDisabled: true } },
              { Id: 'admin', Name: 'Administrator', Policy: { IsAdministrator: true, IsDisabled: false } },
            ],
          }
        : { status: 200, body: [{ Id: 'i1', Name: 'Linux ISO', Type: 'Movie' }] }
    )
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(configuredUserLayer, fake.layer)))

    const error = yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'JellyfinConfiguredUserError')
    assert.strictEqual(error.code, 'JELLYFIN_USER_ID_INVALID')
    assert.strictEqual(error.message, 'Configured Jellyfin user disabled is disabled')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('JellyfinApiLive rejects zero enabled administrators before requesting media', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient((_method, url) =>
      url.pathname === '/Users'
        ? {
            status: 200,
            body: [
              { Id: 'viewer', Name: 'Viewer', Policy: { IsAdministrator: false, IsDisabled: false } },
              { Id: 'disabled-admin', Name: 'Disabled Admin', Policy: { IsAdministrator: true, IsDisabled: true } },
            ],
          }
        : { status: 200, body: [{ Id: 'i1', Name: 'Linux ISO', Type: 'Movie' }] }
    )
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'JellyfinNoEnabledAdministratorError')
    assert.strictEqual(error.code, 'JELLYFIN_NO_ENABLED_ADMINISTRATOR')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('JellyfinApiLive rejects multiple enabled administrators before requesting media', () =>
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
        : { status: 200, body: [{ Id: 'i1', Name: 'Linux ISO', Type: 'Movie' }] }
    )
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* recentlyAdded({ limit: 5 }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'JellyfinAmbiguousAdministratorError')
    assert.strictEqual(error.code, 'JELLYFIN_AMBIGUOUS_ADMINISTRATOR')
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => new URL(request.url).pathname),
      ['/Users']
    )
  })
)

it.effect('JellyfinApiLive can run tasks without applying media user selection', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 204, body: null }))
    const layer = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(yield* runTask('task1').pipe(Effect.provide(layer)), {
      started: true,
      taskId: 'task1',
      httpStatus: 204,
    })
    assert.deepStrictEqual(
      (yield* Ref.get(fake.requests)).map((request) => ({ method: request.method, url: request.url })),
      [{ method: 'POST', url: 'http://jellyfin.example.test/ScheduledTasks/Running/task1' }]
    )
  })
)
