import { assert, describe, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/integration-http/testing'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import type * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { CalendarDate, IanaTimezone, MediaActionRejected, ShoppingItemAddition, ShoppingItemUpdate } from '#shared'

import type { EntityStateResponse } from '../src/home-assistant/api-schema.js'
import { HomeAssistantApiLive } from '../src/home-assistant/http.js'
import type { MediaConfig } from '../src/home-assistant/media.js'
import { HomeAssistantApi, HomeAssistantConfig } from '../src/home-assistant/services.js'
import { FrameTimezone } from '../src/settings.js'

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

const mediaStates: ReadonlyArray<EntityStateResponse> = [
  {
    entity_id: 'media_player.den_tv',
    state: 'on',
    attributes: { friendly_name: 'Den TV', supported_features: 24_381, source_list: ['HDMI 1', 'HDMI 2'] },
  },
  {
    entity_id: 'media_player.receiver',
    state: 'on',
    attributes: {
      friendly_name: 'Receiver',
      supported_features: 69_516,
      volume_level: 0.46,
      is_volume_muted: false,
      source_list: ['AUX', 'NETWORK'],
    },
  },
  { entity_id: 'switch.zone_a', state: 'on', attributes: { friendly_name: 'Zone A' } },
  {
    entity_id: 'media_player.music',
    state: 'playing',
    attributes: {
      friendly_name: 'Music',
      supported_features: 18_485,
      media_title: 'Song',
      media_artist: 'Band',
      entity_picture: '/api/media_player_proxy/media_player.music?token=art-token&cache=1',
    },
  },
]

const stateOf = (entity: string) => Arr.findFirst(mediaStates, (state) => state.entity_id === entity)

const ConfigLayer = Layer.mergeAll(
  Layer.succeed(HomeAssistantConfig, {
    url: 'http://ha.example.test:8123/',
    token: Redacted.make('ha-token'),
    weatherEntity: 'weather.home',
    shoppingEntity: 'todo.shopping',
    media: testMedia,
  }),
  Layer.succeed(FrameTimezone, { timezone: IanaTimezone.make('America/New_York') })
)

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)))

const bodyOf = (
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<Readonly<Record<string, string>> | null, Schema.SchemaError> =>
  request.body._tag === 'Uint8Array' ? decodeJson(new TextDecoder().decode(request.body.body)) : Effect.succeed(null)

const recorded = (
  requests: Ref.Ref<ReadonlyArray<{ method: string; url: string; raw: HttpClientRequest.HttpClientRequest }>>
) =>
  Ref.get(requests).pipe(
    Effect.flatMap((records) =>
      Effect.forEach(records, (record) =>
        Effect.map(bodyOf(record.raw), (body) => ({
          method: record.method,
          url: record.url,
          authorization: record.raw.headers.authorization,
          body,
        }))
      )
    )
  )

const bodyText = (request: HttpClientRequest.HttpClientRequest) =>
  request.body._tag === 'Uint8Array' ? new TextDecoder().decode(request.body.body) : ''

describe('HomeAssistantApiLive', () => {
  it.effect('reads current weather and the daily forecast on local dates', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient((method) =>
        method === 'GET'
          ? { status: 200, body: { state: 'partlycloudy', attributes: { temperature: 48, temperature_unit: '°F' } } }
          : {
              status: 200,
              body: {
                changed_states: [],
                service_response: {
                  'weather.home': {
                    forecast: [
                      {
                        datetime: '2026-11-02T03:00:00+00:00',
                        condition: 'rainy',
                        temperature: 52,
                        templow: 40,
                        precipitation_probability: 80,
                      },
                      { datetime: '2026-11-03T17:00:00+00:00', condition: 'sunny', temperature: 55, templow: null },
                    ],
                  },
                },
              },
            }
      )

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const weather = yield* api.weather

      assert.strictEqual(weather.condition, 'partlycloudy')
      assert.strictEqual(weather.temperature, 48)
      assert.deepStrictEqual(weather.forecast, [
        { date: CalendarDate.make('2026-11-01'), condition: 'rainy', high: 52, low: 40, precipitationProbability: 80 },
        {
          date: CalendarDate.make('2026-11-03'),
          condition: 'sunny',
          high: 55,
          low: null,
          precipitationProbability: null,
        },
      ])
      assert.deepStrictEqual(yield* recorded(fake.requests), [
        {
          method: 'GET',
          url: 'http://ha.example.test:8123/api/states/weather.home',
          authorization: 'Bearer ha-token',
          body: null,
        },
        {
          method: 'POST',
          url: 'http://ha.example.test:8123/api/services/weather/get_forecasts?return_response',
          authorization: 'Bearer ha-token',
          body: { entity_id: 'weather.home', type: 'daily' },
        },
      ])
    })
  )

  it.effect('reads shopping items and updates an item by uid', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient((_method, url) =>
        Str.endsWith('/update_item')(url.pathname)
          ? { status: 200, body: [] }
          : {
              status: 200,
              body: {
                service_response: {
                  'todo.shopping': { items: [{ uid: 'a1', summary: 'Milk', status: 'needs_action' }] },
                },
              },
            }
      )

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      yield* api.updateShoppingItem(ShoppingItemUpdate.make({ uid: 'a1', status: 'completed' }))
      const items = yield* api.shoppingItems

      assert.deepStrictEqual(items, [{ uid: 'a1', summary: 'Milk', status: 'needs_action' }])
      assert.deepStrictEqual(
        Arr.map(yield* recorded(fake.requests), (request) => [request.method, request.url, request.body]),
        [
          [
            'POST',
            'http://ha.example.test:8123/api/services/todo/update_item',
            { entity_id: 'todo.shopping', item: 'a1', status: 'completed' },
          ],
          [
            'POST',
            'http://ha.example.test:8123/api/services/todo/get_items?return_response',
            { entity_id: 'todo.shopping' },
          ],
        ]
      )
    })
  )

  it.effect('adds a shopping item to the configured list', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: [] }))

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      yield* api.addShoppingItem(ShoppingItemAddition.make({ summary: 'Bread' }))

      assert.deepStrictEqual(
        Arr.map(yield* recorded(fake.requests), (request) => [request.method, request.url, request.body]),
        [
          [
            'POST',
            'http://ha.example.test:8123/api/services/todo/add_item',
            { entity_id: 'todo.shopping', item: 'Bread' },
          ],
        ]
      )
    })
  )

  it.effect('reads configured media in screen order, with a missing zone shown as unavailable', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient((_method, url) => {
        const entity = Str.replace('/api/states/', '')(url.pathname)

        return Option.match(stateOf(entity), {
          onNone: () => ({ status: 404, body: { message: 'Entity not found.' } }),
          onSome: (state) => ({ status: 200, body: state }),
        })
      })

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const media = yield* api.media

      assert.strictEqual(media.spotify?.name, 'Music')
      assert.strictEqual(media.spotify?.nowPlaying?.title, 'Song')
      assert.deepStrictEqual(
        Arr.map(media.cards, (card) => (card._tag === 'PlayerCard' ? card.player.name : 'zones')),
        ['Den TV', 'Receiver', 'zones']
      )
      const [, receiver, zones] = media.cards
      assert.deepStrictEqual(receiver?._tag === 'PlayerCard' ? receiver.player.controls : [], [
        'power',
        'volume',
        'mute',
      ])
      assert.deepStrictEqual(zones?._tag === 'ZonesCard' ? zones.speakers : null, {
        zones: [
          { entityId: 'switch.zone_a', name: 'Zone A', isOn: true, isAvailable: true },
          { entityId: 'switch.zone_b', name: 'switch.zone_b', isOn: false, isAvailable: false },
        ],
        hasAllOn: true,
        hasAllOff: false,
      })
      assert.notInclude(media.spotify?.nowPlaying?.artVersion ?? '', 'art-token')
    })
  )

  it.effect('sends allowed media actions as Home Assistant service calls', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: [] }))

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      yield* api.runMediaAction({ _tag: 'ZoneOn', entityId: 'switch.zone_a' })
      yield* api.runMediaAction({ _tag: 'SetMute', entityId: 'media_player.receiver', muted: true })

      const requests = yield* Ref.get(fake.requests)
      assert.deepStrictEqual(
        Arr.map(requests, (request) => [
          request.method,
          request.url,
          request.raw.headers.authorization,
          bodyText(request.raw),
        ]),
        [
          [
            'POST',
            'http://ha.example.test:8123/api/services/switch/turn_on',
            'Bearer ha-token',
            '{"entity_id":"switch.zone_a"}',
          ],
          [
            'POST',
            'http://ha.example.test:8123/api/services/media_player/volume_mute',
            'Bearer ha-token',
            '{"entity_id":"media_player.receiver","is_volume_muted":true}',
          ],
        ]
      )
    })
  )

  it.effect('refuses media actions outside the allowlist without calling Home Assistant', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: [] }))

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const refused = yield* api
        .runMediaAction({ _tag: 'SelectSource', entityId: 'media_player.receiver', source: 'AUX' })
        .pipe(Effect.flip)

      assert.instanceOf(refused, MediaActionRejected)
      assert.deepStrictEqual(yield* recorded(fake.requests), [])
    })
  )

  it.effect('proxies artwork only for configured players', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient((_method, url) =>
        Str.startsWith('/api/media_player_proxy/')(url.pathname)
          ? { status: 200, body: 'PNG', headers: new Headers({ 'content-type': 'image/png' }) }
          : { status: 200, body: Option.getOrNull(stateOf('media_player.music')) }
      )

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const artwork = yield* api.mediaArtwork('media_player.music')
      const foreign = yield* api.mediaArtwork('media_player.neighbor')

      assert.strictEqual(Option.map(artwork, (art) => art.contentType).pipe(Option.getOrNull), 'image/png')
      assert.isTrue(Option.isNone(foreign))
      assert.deepStrictEqual(
        Arr.map(yield* recorded(fake.requests), (request) => [request.url, request.authorization]),
        [
          ['http://ha.example.test:8123/api/states/media_player.music', 'Bearer ha-token'],
          [
            'http://ha.example.test:8123/api/media_player_proxy/media_player.music?token=art-token&cache=1',
            'Bearer ha-token',
          ],
        ]
      )
    })
  )

  it.effect('maps HTTP failures to a tagged error without the token', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 401, body: { message: 'unauthorized' } }))

      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const error = yield* Effect.flip(api.shoppingItems)

      assert.strictEqual(error.code, 'HOME_ASSISTANT_HTTP_ERROR')
      assert.notInclude(`${error.message} ${error.fix}`, 'ha-token')
    })
  )
})
