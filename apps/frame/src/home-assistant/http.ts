import { makeJsonClient } from '@garage/integration-http'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'
import * as Redacted from 'effect/Redacted'
import type * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { Weather, calendarDateOf } from '#shared'
import type { ForecastDay, ShoppingItemAddition, ShoppingItemUpdate } from '#shared'

import { homeAssistantDecodeError, homeAssistantHttpError, homeAssistantUnreachable } from '../errors.js'
import type { HomeAssistantError } from '../errors.js'
import { FrameTimezone } from '../settings.js'
import { ForecastServiceResponse, TodoItemsServiceResponse, WeatherStateResponse } from './api-schema.js'
import { HomeAssistantApi, HomeAssistantConfig } from './services.js'

const normalizeBaseUrl = (url: string): string => (url.endsWith('/') ? url.slice(0, -1) : url)

const responseFor = <A>(responses: Record<string, A>, entity: string): Effect.Effect<A, HomeAssistantError> =>
  Option.match(R.get(responses, entity), {
    onNone: () => Effect.fail(homeAssistantDecodeError(`No service response for ${entity}`)),
    onSome: Effect.succeed,
  })

export const HomeAssistantApiLive = Layer.effect(
  HomeAssistantApi,
  Effect.gen(function* () {
    const config = yield* HomeAssistantConfig
    const { timezone } = yield* FrameTimezone
    const client = yield* HttpClient.HttpClient
    const baseUrl = normalizeBaseUrl(config.url)

    const authorize = (request: HttpClientRequest.HttpClientRequest) =>
      request.pipe(HttpClientRequest.bearerToken(Redacted.value(config.token)), HttpClientRequest.acceptJson)

    const http = makeJsonClient<HomeAssistantError>({
      client,
      baseUrl,
      applyAuth: authorize,
      errors: {
        httpError: homeAssistantHttpError,
        unreachable: () => homeAssistantUnreachable('Home Assistant could not be reached'),
        decodeError: (message) => homeAssistantDecodeError(message),
      },
    })

    const callService = <A, I, RD, RE>(
      domain: string,
      service: string,
      body: Readonly<Record<string, string>>,
      schema: Schema.Codec<A, I, RD, RE>
    ): Effect.Effect<A, HomeAssistantError, RD> =>
      http
        .execute(
          HttpClientRequest.post(`${baseUrl}/api/services/${domain}/${service}?return_response`).pipe(
            authorize,
            HttpClientRequest.bodyJsonUnsafe(body)
          )
        )
        .pipe(
          Effect.flatMap((response) =>
            HttpClientResponse.schemaBodyJson(schema)(response).pipe(
              Effect.mapError(() => homeAssistantDecodeError(`Unexpected ${domain}.${service} response`))
            )
          )
        )

    const toForecastDay = (
      entry: (typeof ForecastServiceResponse.Type)['service_response'][string]['forecast'][number]
    ) =>
      Option.map(DateTime.make(entry.datetime), (instant): ForecastDay => ({
        date: calendarDateOf(instant, timezone),
        condition: entry.condition ?? 'unknown',
        high: entry.temperature ?? null,
        low: entry.templow ?? null,
        precipitationProbability: entry.precipitation_probability ?? null,
      }))

    const shoppingItems = Effect.fn('frame.home-assistant.shoppingItems')(function* () {
      const response: TodoItemsServiceResponse = yield* callService(
        'todo',
        'get_items',
        { entity_id: config.shoppingEntity },
        TodoItemsServiceResponse
      )
      const { items } = yield* responseFor(response.service_response, config.shoppingEntity)
      return items
    })

    return HomeAssistantApi.of({
      weather: Effect.fn('frame.home-assistant.weather')(function* () {
        const current: WeatherStateResponse = yield* http.getJson(
          `/api/states/${config.weatherEntity}`,
          WeatherStateResponse
        )
        const forecastResponse = yield* callService(
          'weather',
          'get_forecasts',
          { entity_id: config.weatherEntity, type: 'daily' },
          ForecastServiceResponse
        )
        const { forecast } = yield* responseFor(forecastResponse.service_response, config.weatherEntity)
        return new Weather({
          condition: current.state,
          temperature: current.attributes.temperature ?? null,
          temperatureUnit: current.attributes.temperature_unit ?? '°',
          forecast: Arr.getSomes(Arr.map(forecast, toForecastDay)),
        })
      }),
      shoppingItems,
      addShoppingItem: Effect.fn('frame.home-assistant.addShoppingItem')(function* (addition: ShoppingItemAddition) {
        yield* http.execute(
          HttpClientRequest.post(`${baseUrl}/api/services/todo/add_item`).pipe(
            authorize,
            HttpClientRequest.bodyJsonUnsafe({ entity_id: config.shoppingEntity, item: addition.summary })
          )
        )
      }),
      updateShoppingItem: Effect.fn('frame.home-assistant.updateShoppingItem')(function* (update: ShoppingItemUpdate) {
        yield* http.execute(
          HttpClientRequest.post(`${baseUrl}/api/services/todo/update_item`).pipe(
            authorize,
            HttpClientRequest.bodyJsonUnsafe({
              entity_id: config.shoppingEntity,
              item: update.uid,
              status: update.status,
            })
          )
        )
      }),
    })
  })
)
