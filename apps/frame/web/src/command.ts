import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import { CalendarDate, CalendarWindow, ShoppingItemStatus, ShoppingItemUpdate, addCalendarDays } from '#shared'

import { Api } from './api.js'
import {
  FailedFetchSettings,
  FailedFetchShopping,
  FailedFetchUpcoming,
  FailedFetchWeather,
  FailedFetchWeek,
  SucceededFetchSettings,
  SucceededFetchShopping,
  SucceededFetchUpcoming,
  SucceededFetchWeather,
  SucceededFetchWeek,
} from './message.js'
import type { Message } from './message.js'

/** Commands the frame runs, all requiring the RPC client. */
export type Commands = ReadonlyArray<Command.Command<Message, never, Api>>

// Days of events the Today screen and ambient clock keep loaded.
const UPCOMING_DAYS = 3

export const FetchSettings = Command.define('FetchSettings', {
  messages: [SucceededFetchSettings, FailedFetchSettings],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const settings = yield* api.GetSettings()
    return SucceededFetchSettings({ settings })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchSettings', failure)),
    Effect.orElseSucceed(() => FailedFetchSettings())
  ),
})

export const FetchUpcoming = Command.define('FetchUpcoming', {
  args: { from: CalendarDate },
  messages: [SucceededFetchUpcoming, FailedFetchUpcoming],
  execute: ({ from }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const events = yield* api.GetCalendar(new CalendarWindow({ from, to: addCalendarDays(from, UPCOMING_DAYS) }))
      return SucceededFetchUpcoming({ events })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchUpcoming', failure)),
      Effect.orElseSucceed(() => FailedFetchUpcoming())
    ),
})

export const FetchWeek = Command.define('FetchWeek', {
  args: { from: CalendarDate },
  messages: [SucceededFetchWeek, FailedFetchWeek],
  execute: ({ from }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const events = yield* api.GetCalendar(new CalendarWindow({ from, to: addCalendarDays(from, 7) }))
      return SucceededFetchWeek({ from, events })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchWeek', failure)),
      Effect.orElseSucceed(() => FailedFetchWeek())
    ),
})

export const FetchWeather = Command.define('FetchWeather', {
  messages: [SucceededFetchWeather, FailedFetchWeather],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const weather = yield* api.GetWeather()
    return SucceededFetchWeather({ weather })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchWeather', failure)),
    Effect.orElseSucceed(() => FailedFetchWeather())
  ),
})

export const FetchShopping = Command.define('FetchShopping', {
  messages: [SucceededFetchShopping, FailedFetchShopping],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const items = yield* api.GetShopping()
    return SucceededFetchShopping({ items })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
    Effect.orElseSucceed(() => FailedFetchShopping())
  ),
})

export const UpdateShoppingItem = Command.define('UpdateShoppingItem', {
  args: { uid: Schema.String, status: ShoppingItemStatus },
  messages: [SucceededFetchShopping, FailedFetchShopping],
  execute: ({ uid, status }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const items = yield* api.UpdateShoppingItem(new ShoppingItemUpdate({ uid, status }))
      return SucceededFetchShopping({ items })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
      Effect.orElseSucceed(() => FailedFetchShopping())
    ),
})
