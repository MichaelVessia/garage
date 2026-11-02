import { makeConfigReaders } from '@garage/integration-http'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import type * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'

import type {
  MediaAction,
  MediaActionRejected,
  MediaSnapshot,
  ShoppingItem,
  ShoppingItemAddition,
  ShoppingItemUpdate,
  Weather,
} from '#shared'

import { envInvalid, envMissing } from '../errors.js'
import type { HomeAssistantError } from '../errors.js'
import { parseEntityList, parseMediaSlots } from './media.js'
import type { MediaConfig } from './media.js'

/** Connection details and entity IDs for the household Home Assistant. */
export class HomeAssistantConfig extends Context.Service<
  HomeAssistantConfig,
  {
    readonly url: string
    readonly token: Redacted.Redacted
    readonly weatherEntity: string
    readonly shoppingEntity: string
    readonly media: MediaConfig
  }
>()('@garage/frame/home-assistant/services/HomeAssistantConfig') {}

/** Weather and shopping list operations backed by Home Assistant. */
export class HomeAssistantApi extends Context.Service<
  HomeAssistantApi,
  {
    readonly weather: Effect.Effect<Weather, HomeAssistantError>
    readonly shoppingItems: Effect.Effect<ReadonlyArray<ShoppingItem>, HomeAssistantError>
    readonly addShoppingItem: (addition: ShoppingItemAddition) => Effect.Effect<void, HomeAssistantError>
    readonly updateShoppingItem: (update: ShoppingItemUpdate) => Effect.Effect<void, HomeAssistantError>
    readonly media: Effect.Effect<MediaSnapshot, HomeAssistantError>
    readonly runMediaAction: (action: MediaAction) => Effect.Effect<void, HomeAssistantError | MediaActionRejected>
    /** Artwork bytes for a configured player, or none when it has no proxied artwork. */
    readonly mediaArtwork: (
      entityId: string
    ) => Effect.Effect<Option.Option<{ readonly bytes: Uint8Array; readonly contentType: string }>, HomeAssistantError>
  }
>()('@garage/frame/home-assistant/services/HomeAssistantApi') {}

const { readRequiredSecret, readRequiredString } = makeConfigReaders(envMissing)

const readEntity = (name: string, fallback: string) =>
  Config.NonEmptyString(name).pipe(
    Config.withDefault(fallback),
    Effect.mapError(() => envMissing(name))
  )

const readOptional = (name: string) =>
  Config.String(name).pipe(
    Config.withDefault(''),
    Effect.mapError(() => envMissing(name))
  )

const parsed = <A>(name: string, result: Result.Result<A, string>) =>
  Result.match(result, {
    onSuccess: Effect.succeed,
    onFailure: (reason) => Effect.fail(envInvalid({ variable: name, reason })),
  })

const readOptionalEntity = (name: string, domain: string) =>
  readOptional(name).pipe(
    Effect.flatMap((raw) => parsed(name, parseEntityList(raw, domain))),
    Effect.map((entities) => Option.fromNullishOr(entities[0]))
  )

const readMediaConfig = Effect.fn('frame.homeAssistant.readMediaConfig')(function* () {
  const slots = yield* readOptional('HOME_ASSISTANT_MEDIA_PLAYERS').pipe(
    Effect.flatMap((raw) => parsed('HOME_ASSISTANT_MEDIA_PLAYERS', parseMediaSlots(raw)))
  )

  const zones = yield* readOptional('HOME_ASSISTANT_SPEAKER_ZONES').pipe(
    Effect.flatMap((raw) => parsed('HOME_ASSISTANT_SPEAKER_ZONES', parseEntityList(raw, 'switch')))
  )

  const allOn = yield* readOptionalEntity('HOME_ASSISTANT_SPEAKERS_ALL_ON', 'button')
  const allOff = yield* readOptionalEntity('HOME_ASSISTANT_SPEAKERS_ALL_OFF', 'button')
  const spotify = yield* readOptionalEntity('HOME_ASSISTANT_SPOTIFY_PLAYER', 'media_player')

  return { slots, zones, allOn, allOff, spotify } satisfies MediaConfig
})

export const HomeAssistantConfigLive: Layer.Layer<HomeAssistantConfig, HomeAssistantError> = Layer.effect(
  HomeAssistantConfig,
  Effect.gen(function* () {
    const url = yield* readRequiredString('HOME_ASSISTANT_URL')
    const token = yield* readRequiredSecret('HOME_ASSISTANT_TOKEN')
    const weatherEntity = yield* readEntity('HOME_ASSISTANT_WEATHER_ENTITY', 'weather.forecast_home')
    const shoppingEntity = yield* readEntity('HOME_ASSISTANT_SHOPPING_ENTITY', 'todo.shopping_list')
    const media = yield* readMediaConfig()

    return HomeAssistantConfig.of({ url, token, weatherEntity, shoppingEntity, media })
  })
)
