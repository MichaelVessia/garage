import { makeConfigReaders } from '@garage/integration-http'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Redacted from 'effect/Redacted'

import type { ShoppingItem, ShoppingItemAddition, ShoppingItemUpdate, Weather } from '#shared'

import { envMissing } from '../errors.js'
import type { HomeAssistantError } from '../errors.js'

/** Connection details and entity IDs for the household Home Assistant. */
export class HomeAssistantConfig extends Context.Service<
  HomeAssistantConfig,
  {
    readonly url: string
    readonly token: Redacted.Redacted
    readonly weatherEntity: string
    readonly shoppingEntity: string
  }
>()('@garage/frame/home-assistant/services/HomeAssistantConfig') {}

/** Weather and shopping list operations backed by Home Assistant. */
export class HomeAssistantApi extends Context.Service<
  HomeAssistantApi,
  {
    readonly weather: () => Effect.Effect<Weather, HomeAssistantError>
    readonly shoppingItems: () => Effect.Effect<ReadonlyArray<ShoppingItem>, HomeAssistantError>
    readonly addShoppingItem: (addition: ShoppingItemAddition) => Effect.Effect<void, HomeAssistantError>
    readonly updateShoppingItem: (update: ShoppingItemUpdate) => Effect.Effect<void, HomeAssistantError>
  }
>()('@garage/frame/home-assistant/services/HomeAssistantApi') {}

const { readRequiredSecret, readRequiredString } = makeConfigReaders(envMissing)

const readEntity = (name: string, fallback: string) =>
  Config.nonEmptyString(name).pipe(
    Config.withDefault(fallback),
    Effect.mapError(() => envMissing(name))
  )

export const HomeAssistantConfigLive: Layer.Layer<HomeAssistantConfig, HomeAssistantError> = Layer.effect(
  HomeAssistantConfig,
  Effect.gen(function* () {
    const url = yield* readRequiredString('HOME_ASSISTANT_URL')
    const token = yield* readRequiredSecret('HOME_ASSISTANT_TOKEN')
    const weatherEntity = yield* readEntity('HOME_ASSISTANT_WEATHER_ENTITY', 'weather.forecast_home')
    const shoppingEntity = yield* readEntity('HOME_ASSISTANT_SHOPPING_ENTITY', 'todo.shopping_list')
    return HomeAssistantConfig.of({ url, token, weatherEntity, shoppingEntity })
  })
)
