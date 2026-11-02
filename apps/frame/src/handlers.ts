import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { FrameRpcs, FrameSettings, MediaActionRejected, UpstreamUnavailable, calendarDateStartUtc } from '#shared'
import type { CalendarWindow, MediaAction, ShoppingItemAddition, ShoppingItemUpdate, UpstreamSource } from '#shared'

import { CalendarFeed } from './calendar/services.js'
import type { CalendarError, HomeAssistantError } from './errors.js'
import { HomeAssistantApi } from './home-assistant/services.js'
import { FrameTimezone } from './settings.js'

const publicMessages = {
  calendar: 'The family calendar is unavailable right now.',
  'home-assistant': 'Home Assistant is unavailable right now.',
} satisfies Record<UpstreamSource, string>

// Upstream errors stay in server logs by code only; the browser receives a fixed, credential-free message.
const toPublicError =
  (source: UpstreamSource) =>
  <A, R>(effect: Effect.Effect<A, CalendarError | HomeAssistantError, R>): Effect.Effect<A, UpstreamUnavailable, R> =>
    effect.pipe(
      Effect.tapError((failure) =>
        Effect.logWarning('Upstream request failed').pipe(Effect.annotateLogs({ code: failure.code }))
      ),
      Effect.mapError(() => UpstreamUnavailable.make({ source, message: publicMessages[source] }))
    )

const isRejected = Schema.is(MediaActionRejected)

// A refused media change is already credential-free, so it reaches the browser as is.
const toPublicMediaError = <A, R>(
  effect: Effect.Effect<A, HomeAssistantError | MediaActionRejected, R>
): Effect.Effect<A, UpstreamUnavailable | MediaActionRejected, R> =>
  effect.pipe(
    Effect.tapError((failure) =>
      Effect.logWarning('Media action failed').pipe(
        Effect.annotateLogs({ code: isRejected(failure) ? 'MEDIA_ACTION_REJECTED' : failure.code })
      )
    ),
    Effect.mapError((failure) =>
      isRejected(failure)
        ? failure
        : UpstreamUnavailable.make({ source: 'home-assistant', message: publicMessages['home-assistant'] })
    )
  )

export const FrameHandlersLive = FrameRpcs.toLayer(
  Effect.gen(function* () {
    const { timezone } = yield* FrameTimezone
    const calendar = yield* CalendarFeed
    const homeAssistant = yield* HomeAssistantApi

    return {
      GetSettings: () => Effect.succeed(FrameSettings.make({ timezone })),
      GetCalendar: (window: CalendarWindow) =>
        calendar
          .occurrences({
            start: calendarDateStartUtc(window.from, timezone),
            end: calendarDateStartUtc(window.to, timezone),
          })
          .pipe(toPublicError('calendar')),
      GetWeather: () => homeAssistant.weather.pipe(toPublicError('home-assistant')),
      GetShopping: () => homeAssistant.shoppingItems.pipe(toPublicError('home-assistant')),
      AddShoppingItem: (addition: ShoppingItemAddition) =>
        homeAssistant
          .addShoppingItem(addition)
          .pipe(Effect.andThen(homeAssistant.shoppingItems), toPublicError('home-assistant')),
      GetMedia: () => homeAssistant.media.pipe(toPublicError('home-assistant')),
      RunMediaAction: (action: MediaAction) =>
        homeAssistant.runMediaAction(action).pipe(Effect.andThen(homeAssistant.media), toPublicMediaError),
      UpdateShoppingItem: (update: ShoppingItemUpdate) =>
        homeAssistant
          .updateShoppingItem(update)
          .pipe(Effect.andThen(homeAssistant.shoppingItems), toPublicError('home-assistant')),
    }
  })
)
