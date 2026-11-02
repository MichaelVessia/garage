import { assert, describe, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/integration-http/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import type { HttpClientRequest } from 'effect/unstable/http'

import { CalendarDate, IanaTimezone, ShoppingItemUpdate } from '#shared'

import { HomeAssistantApiLive } from '../src/home-assistant/http.js'
import { HomeAssistantApi, HomeAssistantConfig } from '../src/home-assistant/services.js'
import { FrameTimezone } from '../src/settings.js'

const ConfigLayer = Layer.mergeAll(
  Layer.succeed(HomeAssistantConfig, {
    url: 'http://ha.example.test:8123/',
    token: Redacted.make('ha-token'),
    weatherEntity: 'weather.home',
    shoppingEntity: 'todo.shopping',
  }),
  Layer.succeed(FrameTimezone, { timezone: IanaTimezone.make('America/New_York') })
)

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)))

const bodyOf = (request: HttpClientRequest.HttpClientRequest): Record<string, string> | null =>
  request.body._tag === 'Uint8Array' ? decodeJson(new TextDecoder().decode(request.body.body)) : null

const recorded = (
  requests: Ref.Ref<ReadonlyArray<{ method: string; url: string; raw: HttpClientRequest.HttpClientRequest }>>
) =>
  Ref.get(requests).pipe(
    Effect.map((records) =>
      records.map((record) => ({
        method: record.method,
        url: record.url,
        authorization: record.raw.headers.authorization,
        body: bodyOf(record.raw),
      }))
    )
  )

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

      const weather = yield* api.weather()

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
        url.pathname.endsWith('/update_item')
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

      yield* api.updateShoppingItem(new ShoppingItemUpdate({ uid: 'a1', status: 'completed' }))
      const items = yield* api.shoppingItems()

      assert.deepStrictEqual(items, [{ uid: 'a1', summary: 'Milk', status: 'needs_action' }])
      assert.deepStrictEqual(
        (yield* recorded(fake.requests)).map((request) => [request.method, request.url, request.body]),
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

  it.effect('maps HTTP failures to a tagged error without the token', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 401, body: { message: 'unauthorized' } }))
      const api = yield* HomeAssistantApi.pipe(
        Effect.provide(HomeAssistantApiLive.pipe(Layer.provide(Layer.merge(ConfigLayer, fake.layer))))
      )

      const error = yield* Effect.flip(api.shoppingItems())

      assert.strictEqual(error.code, 'HOME_ASSISTANT_HTTP_ERROR')
      assert.notInclude(`${error.message} ${error.fix}`, 'ha-token')
    })
  )
})
