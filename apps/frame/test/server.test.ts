import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform'
import * as BunServices from '@effect/platform-bun/BunServices'
import { afterAll, assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { IanaTimezone } from '#shared'

import { CalendarFeedLive } from '../src/calendar/http.js'
import { CalendarConfig } from '../src/calendar/services.js'
import { FrameHandlersLive } from '../src/handlers.js'
import { HomeAssistantApiLive } from '../src/home-assistant/http.js'
import type { MediaConfig } from '../src/home-assistant/media.js'
import { HomeAssistantConfig } from '../src/home-assistant/services.js'
import { frameRoutes } from '../src/server.js'
import { FrameTimezone } from '../src/settings.js'
import { calendarId, googleResponse, makeServiceAccount, tokenUri } from './fixtures/google-calendar.js'

const testMedia: MediaConfig = {
  slots: [
    { _tag: 'Player', player: { entityId: 'media_player.den_tv', controls: Option.none() } },
    {
      _tag: 'Player',
      player: { entityId: 'media_player.receiver', controls: Option.some(['power', 'volume', 'mute']) },
    },
    { _tag: 'Zones' },
  ],
  zones: ['switch.zone_a', 'switch.zone_b'],
  allOn: Option.some('button.zones_on'),
  allOff: Option.none(),
  spotify: Option.some('media_player.music'),
}

const webRoot = new URL('fixtures/web', import.meta.url).pathname

const respond = (url: URL): Response => {
  if (url.toString() === tokenUri || url.hostname === 'www.googleapis.com') {
    const google = googleResponse(url)

    return Response.json(google.body, { status: google.status })
  }

  if (Str.endsWith('/get_items')(url.pathname)) {
    return Response.json({
      service_response: { 'todo.shopping': { items: [{ uid: 'a1', summary: 'Eggs', status: 'needs_action' }] } },
    })
  }

  if (url.pathname === '/api/states/switch.zone_a') {
    return Response.json({ entity_id: 'switch.zone_a', state: 'on', attributes: { friendly_name: 'Zone A' } })
  }

  if (url.pathname === '/api/states/media_player.music') {
    return Response.json({
      entity_id: 'media_player.music',
      state: 'playing',
      attributes: {
        friendly_name: 'Music',
        media_title: 'Song',
        entity_picture: '/api/media_player_proxy/media_player.music?token=art-token&cache=1',
      },
    })
  }

  if (Str.startsWith('/api/states/')(url.pathname)) {
    return Response.json({ message: 'Entity not found.' }, { status: 404 })
  }

  if (url.pathname === '/api/services/switch/turn_on') {
    return Response.json([])
  }

  if (url.pathname === '/api/media_player_proxy/media_player.music') {
    return new Response('PNG', { headers: { 'content-type': 'image/png' } })
  }

  return new Response(null, { status: 401 })
}

const upstream = HttpClient.make((request, url) => Effect.succeed(HttpClientResponse.fromWeb(request, respond(url))))

const ServicesLayer = Layer.merge(CalendarFeedLive, HomeAssistantApiLive).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.succeed(FrameTimezone, { timezone: IanaTimezone.make('America/New_York') }),
      Layer.effect(
        CalendarConfig,
        makeServiceAccount.pipe(
          Effect.map((serviceAccount) =>
            CalendarConfig.of({ calendarId, serviceAccount, calendarColor: Option.none() })
          )
        )
      ),
      Layer.succeed(HomeAssistantConfig, {
        url: 'http://ha.example.test:8123',
        token: Redacted.make('ha-token'),
        weatherEntity: 'weather.home',
        shoppingEntity: 'todo.shopping',
        media: testMedia,
      }),
      Layer.succeed(HttpClient.HttpClient, upstream)
    )
  )
)

const { handler, dispose } = HttpRouter.toWebHandler(
  frameRoutes({ webRoot, buildId: Option.none() }).pipe(
    Layer.provide(FrameHandlersLive),
    Layer.provide(ServicesLayer),
    Layer.provide(Layer.merge(BunServices.layer, BunHttpPlatform.layer))
  ),
  { disableLogger: true }
)

afterAll(() => dispose())

class TestRequestError extends Schema.TaggedError<TestRequestError, { readonly brand: unique symbol }>()(
  'TestRequestError',
  {
    cause: Schema.Defect(),
  }
) {}

const decodeHealth = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ status: Schema.String, version: Schema.String }))
)

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))

const send = Effect.fn('test.send')(function* (request: Request) {
  const response = yield* Effect.tryPromise({
    try: () => handler(request),
    catch: (cause) => TestRequestError.make({ cause }),
  })

  const body = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) => TestRequestError.make({ cause }),
  })

  return { status: response.status, body }
})

const rpc = (tag: string, payload: Readonly<Record<string, string>> | null) =>
  encodeJson({ _tag: 'Request', id: '1', tag, payload, headers: [] }).pipe(
    Effect.flatMap((body) =>
      send(
        new Request('http://frame.test/rpc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      )
    ),
    Effect.map((response) => response.body)
  )

const get = (path: string) => send(new Request(`http://frame.test${path}`))

describe('frame server', () => {
  it.effect('reports readiness with the version embedded in the served page', () =>
    Effect.gen(function* () {
      const health = yield* get('/health')
      const page = yield* get('/')
      const { version } = yield* decodeHealth(health.body)

      assert.strictEqual(health.status, 200)
      assert.match(version, /^[\da-f]+-\d+$/u)
      assert.include(page.body, `<meta name="frame-version" content="${version}" />`)
    })
  )

  it.effect('reports an injected build id instead of the fingerprint', () =>
    Effect.gen(function* () {
      const injected = HttpRouter.toWebHandler(
        frameRoutes({ webRoot, buildId: Option.some('build-42') }).pipe(
          Layer.provide(FrameHandlersLive),
          Layer.provide(ServicesLayer),
          Layer.provide(Layer.merge(BunServices.layer, BunHttpPlatform.layer))
        ),
        { disableLogger: true }
      )

      const response = yield* Effect.tryPromise({
        try: () => injected.handler(new Request('http://frame.test/health')).then((res) => res.text()),
        catch: (cause) => TestRequestError.make({ cause }),
      })

      yield* Effect.tryPromise({ try: () => injected.dispose(), catch: (cause) => TestRequestError.make({ cause }) })

      const decoded = yield* decodeHealth(response)

      assert.strictEqual(decoded.version, 'build-42')
    })
  )

  it.effect('serves calendar occurrences through RPC and the live calendar adapter', () =>
    Effect.gen(function* () {
      const body = yield* rpc('GetCalendar', { from: '2026-11-07', to: '2026-11-08' })

      assert.include(body, 'Grandparents visiting')
      assert.include(body, '"_tag":"Success"')
    })
  )

  it.effect('serves shopping items through RPC and the live Home Assistant adapter', () =>
    Effect.gen(function* () {
      const body = yield* rpc('GetShopping', null)

      assert.include(body, 'Eggs')
    })
  )

  it.effect('returns a credential-free failure when Home Assistant rejects the token', () =>
    Effect.gen(function* () {
      const body = yield* rpc('GetWeather', null)

      assert.include(body, 'UpstreamUnavailable')
      assert.notInclude(body, 'ha-token')
    })
  )

  it.effect('runs an allowed media action through RPC and returns the refreshed media', () =>
    Effect.gen(function* () {
      const body = yield* rpc('RunMediaAction', { _tag: 'ZoneOn', entityId: 'switch.zone_a' })

      assert.include(body, '"_tag":"Success"')
      assert.include(body, 'Zone A')
      assert.notInclude(body, 'art-token')
    })
  )

  it.effect('refuses a media action for an entity that is not configured', () =>
    Effect.gen(function* () {
      const body = yield* rpc('RunMediaAction', { _tag: 'ZoneOn', entityId: 'switch.front_door' })

      assert.include(body, 'MediaActionRejected')
    })
  )

  it.effect('proxies artwork for configured players only', () =>
    Effect.gen(function* () {
      const art = yield* send(new Request('http://frame.test/media/art/media_player.music?v=1'))
      const foreign = yield* get('/media/art/media_player.neighbor')

      assert.strictEqual(art.status, 200)
      assert.strictEqual(art.body, 'PNG')
      assert.strictEqual(foreign.status, 404)
    })
  )

  it.effect('serves built assets and falls back to index.html without escaping the web root', () =>
    Effect.gen(function* () {
      const asset = yield* get('/assets/app.js')
      const route = yield* get('/calendar/week')
      const traversal = yield* get('/../server.test.ts')

      assert.include(asset.body, 'frame-fixture')
      assert.include(route.body, '<title>frame</title>')
      assert.include(traversal.body, '<title>frame</title>')
    })
  )
})
