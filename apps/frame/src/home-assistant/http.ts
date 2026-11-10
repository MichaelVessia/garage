import { makeJsonClient } from '@garage/integration-http'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import * as R from 'effect/Record'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import type * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { MediaActionRejected, MediaSnapshot, Weather, calendarDateOf } from '#shared'
import type {
  ForecastDay,
  ForecastHour,
  MediaAction,
  MediaCard,
  ShoppingItemAddition,
  ShoppingItemUpdate,
} from '#shared'

import { homeAssistantDecodeError, homeAssistantHttpError, homeAssistantUnreachable } from '../errors.js'
import type { HomeAssistantError } from '../errors.js'
import { FrameTimezone } from '../settings.js'
import {
  EntityStateResponse,
  ForecastServiceResponse,
  TodoItemsServiceResponse,
  WeatherStateResponse,
} from './api-schema.js'
import {
  artworkPath,
  authorizeMediaAction,
  isArtworkEntity,
  mediaLayout,
  toMediaPlayer,
  toSpeakerZone,
} from './media.js'
import { HomeAssistantApi, HomeAssistantConfig } from './services.js'

const normalizeBaseUrl = (url: string): string => (Str.endsWith('/')(url) ? Str.slice(0, -1)(url) : url)

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

// Home Assistant reports the bearing in degrees or, for some integrations, as a compass point.
const bearingDegrees = (bearing: number | string): Option.Option<number> =>
  Match.value(bearing).pipe(
    Match.when(Match.number, (degrees) => Option.some(degrees)),
    Match.orElse((point) =>
      Option.map(
        Arr.findFirstIndex(COMPASS, (name) => name === Str.toUpperCase(Str.trim(point))),
        (index) => index * 22.5
      )
    )
  )

// The frame shows at most a day of hourly forecast.
const HOURS_KEPT = 24

const responseFor = <A>(responses: Record<string, A>, entity: string): Effect.Effect<A, HomeAssistantError> =>
  Effect.fromOption(R.get(responses, entity)).pipe(
    Effect.mapError(() => homeAssistantDecodeError({ message: `No service response for ${entity}` }))
  )

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
        unreachable: () => homeAssistantUnreachable({ message: 'Home Assistant could not be reached' }),
        decodeError: ({ message }) => homeAssistantDecodeError({ message }),
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
              Effect.mapError(() => homeAssistantDecodeError({ message: `Unexpected ${domain}.${service} response` }))
            )
          )
        )

    const toForecastDay = (entry: ForecastServiceResponse['service_response'][string]['forecast'][number]) =>
      Option.map(DateTime.make(entry.datetime), (instant): ForecastDay => ({
        date: calendarDateOf(instant, timezone),
        condition: entry.condition ?? 'unknown',
        high: entry.temperature ?? null,
        low: entry.templow ?? null,
        precipitationProbability: entry.precipitation_probability ?? null,
      }))

    const shoppingItems = Effect.fn('frame.homeAssistant.shoppingItems')(function* () {
      const response: TodoItemsServiceResponse = yield* callService(
        'todo',
        'get_items',
        { entity_id: config.shoppingEntity },
        TodoItemsServiceResponse
      )

      const { items } = yield* responseFor(response.service_response, config.shoppingEntity)

      return items
    })

    // A configured entity that Home Assistant no longer knows is shown as unavailable, not as an error.
    const entityState = (entityId: string) =>
      http.getJson(`/api/states/${entityId}`, EntityStateResponse).pipe(
        Effect.asSome,
        Effect.catchTag('HomeAssistantHttpError', (failure) =>
          failure.status === 404
            ? Effect.logDebug('Configured entity not found', entityId).pipe(
                Effect.as(Option.none<EntityStateResponse>())
              )
            : Effect.fail(failure)
        )
      )

    const media = Effect.fn('frame.homeAssistant.media')(function* () {
      const mediaConfig = config.media

      const spotify = yield* Effect.forEach(
        Option.toArray(mediaConfig.spotify),
        (entityId) =>
          Effect.map(entityState(entityId), (state) => toMediaPlayer({ entityId, controls: Option.none() }, state)),
        { concurrency: 'unbounded' }
      )

      const zones = yield* Effect.forEach(
        mediaConfig.zones,
        (entityId) => Effect.map(entityState(entityId), (state) => toSpeakerZone(entityId, state)),
        { concurrency: 'unbounded' }
      )

      const cards = yield* Effect.forEach(
        mediaLayout(mediaConfig),
        (slot): Effect.Effect<MediaCard, HomeAssistantError> =>
          Match.valueTags(slot, {
            Zones: () =>
              Effect.succeed<MediaCard>({
                _tag: 'ZonesCard',
                speakers: {
                  zones,
                  hasAllOn: Option.isSome(mediaConfig.allOn),
                  hasAllOff: Option.isSome(mediaConfig.allOff),
                },
              }),
            Player: ({ player }) =>
              Effect.map(entityState(player.entityId), (state): MediaCard => ({
                _tag: 'PlayerCard',
                player: toMediaPlayer(player, state),
              })),
          }),
        { concurrency: 'unbounded' }
      )

      return MediaSnapshot.make({ spotify: spotify[0] ?? null, cards })
    })

    const runMediaAction = Effect.fn('frame.homeAssistant.runMediaAction')(function* (action: MediaAction) {
      yield* Effect.annotateCurrentSpan('action', action._tag)

      const call = yield* Result.match(authorizeMediaAction(config.media, action), {
        onSuccess: Effect.succeed,
        onFailure: (message) => Effect.fail(MediaActionRejected.make({ message })),
      })

      yield* http.execute(
        HttpClientRequest.post(`${baseUrl}/api/services/${call.domain}/${call.service}`).pipe(
          authorize,
          HttpClientRequest.bodyJsonUnsafe(call.data)
        )
      )
    })

    const mediaArtwork = Effect.fn('frame.homeAssistant.mediaArtwork')(function* (entityId: string) {
      if (!isArtworkEntity(config.media, entityId)) {
        return Option.none()
      }

      const path = yield* entityState(entityId).pipe(Effect.map(Option.flatMap(artworkPath)))

      if (Option.isNone(path)) {
        return Option.none()
      }

      const response = yield* http.execute(
        HttpClientRequest.get(`${baseUrl}${path.value}`).pipe(
          HttpClientRequest.bearerToken(Redacted.value(config.token))
        )
      )

      const bytes = yield* response.arrayBuffer.pipe(
        Effect.mapError(() => homeAssistantDecodeError({ message: 'Artwork could not be read' }))
      )

      return Option.some({
        bytes: new Uint8Array(bytes),
        contentType: response.headers['content-type'] ?? 'image/jpeg',
      })
    })

    const forecastEntries = (type: 'daily' | 'hourly') =>
      callService('weather', 'get_forecasts', { entity_id: config.weatherEntity, type }, ForecastServiceResponse).pipe(
        Effect.flatMap((response) => responseFor(response.service_response, config.weatherEntity)),
        Effect.map(({ forecast }) => forecast)
      )

    const toForecastHour = (entry: ForecastServiceResponse['service_response'][string]['forecast'][number]) =>
      Option.map(DateTime.make(entry.datetime), (time): ForecastHour => ({
        time: DateTime.toUtc(time),
        condition: entry.condition ?? 'unknown',
        temperature: entry.temperature ?? null,
        precipitationProbability: entry.precipitation_probability ?? null,
      }))

    const weather = Effect.fn('frame.homeAssistant.weather')(function* () {
      const [current, daily, hourly] = yield* Effect.all(
        [
          http.getJson(`/api/states/${config.weatherEntity}`, WeatherStateResponse),
          forecastEntries('daily'),
          // Some weather integrations offer no hourly forecast; the frame then shows the daily one alone.
          forecastEntries('hourly').pipe(
            Effect.catch((error) => Effect.logDebug('Hourly forecast unavailable', error.code).pipe(Effect.as([])))
          ),
        ],
        { concurrency: 'unbounded' }
      )

      const { attributes }: WeatherStateResponse = current

      return Weather.make({
        condition: current.state,
        temperature: attributes.temperature ?? null,
        temperatureUnit: attributes.temperature_unit ?? '°',
        feelsLike: attributes.apparent_temperature ?? null,
        humidity: attributes.humidity ?? null,
        wind: P.isNotNullish(attributes.wind_speed)
          ? {
              speed: attributes.wind_speed,
              unit: attributes.wind_speed_unit ?? '',
              bearing: Option.fromNullishOr(attributes.wind_bearing).pipe(
                Option.flatMap(bearingDegrees),
                Option.getOrNull
              ),
            }
          : null,
        uvIndex: attributes.uv_index ?? null,
        hourly: Arr.take(Arr.getSomes(Arr.map(hourly, toForecastHour)), HOURS_KEPT),
        forecast: Arr.getSomes(Arr.map(daily, toForecastDay)),
      })
    })

    return HomeAssistantApi.of({
      weather: weather(),
      shoppingItems: shoppingItems(),
      media: media(),
      runMediaAction,
      mediaArtwork,
      addShoppingItem: Effect.fn('frame.homeAssistant.addShoppingItem')(function* (addition: ShoppingItemAddition) {
        yield* http.execute(
          HttpClientRequest.post(`${baseUrl}/api/services/todo/add_item`).pipe(
            authorize,
            HttpClientRequest.bodyJsonUnsafe({ entity_id: config.shoppingEntity, item: addition.summary })
          )
        )
      }),
      updateShoppingItem: Effect.fn('frame.homeAssistant.updateShoppingItem')(function* (update: ShoppingItemUpdate) {
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
