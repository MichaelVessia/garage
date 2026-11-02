import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError'
import { Command } from 'foldkit'

import {
  CalendarDate,
  CalendarWindow,
  MediaAction,
  ShoppingItemAddition,
  ShoppingItemStatus,
  ShoppingItemUpdate,
  addCalendarDays,
} from '#shared'
import type { UpstreamUnavailable } from '#shared'

import { Api } from './api.js'
import {
  CheckedVersion,
  FailedCheckVersion,
  FailedFetchMedia,
  FailedFetchSettings,
  FailedMediaAction,
  FailedFetchShopping,
  FailedFetchUpcoming,
  FailedFetchWeather,
  FailedFetchWeek,
  SucceededFetchMedia,
  SucceededFetchSettings,
  SucceededFetchShopping,
  SucceededFetchUpcoming,
  SucceededFetchWeather,
  SucceededFetchWeek,
  StartedReload,
} from './message.js'
import type { Message } from './message.js'

/** Commands the frame runs. */
export type Commands = ReadonlyArray<Command.Command<Message, never, Api | HttpClient.HttpClient>>

// Days of events the Today screen and ambient clock keep loaded.
const UPCOMING_DAYS = 3
const SETTINGS_RETRY = Duration.seconds(5)

const Health = Schema.Struct({ version: Schema.String })

// An upstream failure means the frame server answered; a client error means it could not be reached.
const recoverWith =
  <B>(toFailure: (isServerReachable: boolean) => B) =>
  <A, R>(effect: Effect.Effect<A, UpstreamUnavailable | RpcClientError, R>): Effect.Effect<A | B, never, R> =>
    effect.pipe(
      Effect.catchTags({
        UpstreamUnavailable: () => Effect.succeed(toFailure(true)),
        RpcClientError: () => Effect.succeed(toFailure(false)),
      })
    )

const fetchSettings = Effect.fn('frame.fetchSettings')(function* () {
  const api = yield* Api
  const settings = yield* api.GetSettings()
  return SucceededFetchSettings({ settings })
})

export const FetchSettings = Command.define('FetchSettings', {
  messages: [SucceededFetchSettings, FailedFetchSettings],
  execute: fetchSettings().pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchSettings', failure)),
    recoverWith((isServerReachable) => FailedFetchSettings({ isServerReachable }))
  ),
})

// Without settings the frame shows only its start screen, so retry steadily until the server answers.
export const RetrySettings = Command.define('RetrySettings', {
  messages: [SucceededFetchSettings, FailedFetchSettings],
  execute: Effect.sleep(SETTINGS_RETRY).pipe(
    Effect.andThen(fetchSettings()),
    Effect.tapError((failure) => Effect.logWarning('FailedFetchSettings', failure)),
    recoverWith((isServerReachable) => FailedFetchSettings({ isServerReachable }))
  ),
})

export const CheckVersion = Command.define('CheckVersion', {
  messages: [CheckedVersion, FailedCheckVersion],
  execute: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get('/health')
    const health = yield* HttpClientResponse.schemaBodyJson(Health)(response)
    return CheckedVersion({ version: health.version })
  }).pipe(
    Effect.tapError((failure) => Effect.logInfo('Frame server unreachable', failure)),
    Effect.orElseSucceed(() => FailedCheckVersion())
  ),
})

export const ReloadPage = Command.define('ReloadPage', {
  messages: [StartedReload],
  execute: Effect.sync(() => {
    globalThis.location.reload()
    return StartedReload()
  }),
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
      recoverWith((isServerReachable) => FailedFetchUpcoming({ isServerReachable }))
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
      recoverWith((isServerReachable) => FailedFetchWeek({ isServerReachable }))
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
    recoverWith((isServerReachable) => FailedFetchWeather({ isServerReachable }))
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
    recoverWith((isServerReachable) => FailedFetchShopping({ isServerReachable }))
  ),
})

export const FetchMedia = Command.define('FetchMedia', {
  messages: [SucceededFetchMedia, FailedFetchMedia],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const media = yield* api.GetMedia()
    return SucceededFetchMedia({ media })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchMedia', failure)),
    recoverWith((isServerReachable) => FailedFetchMedia({ isServerReachable }))
  ),
})

export const RunMediaAction = Command.define('RunMediaAction', {
  args: { action: MediaAction },
  messages: [SucceededFetchMedia, FailedMediaAction],
  execute: ({ action }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const media = yield* api.RunMediaAction(action)
      return SucceededFetchMedia({ media })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedMediaAction', failure)),
      Effect.orElseSucceed(() => FailedMediaAction())
    ),
})

export const AddShoppingItem = Command.define('AddShoppingItem', {
  args: { summary: Schema.String },
  messages: [SucceededFetchShopping, FailedFetchShopping],
  execute: ({ summary }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const items = yield* api.AddShoppingItem(new ShoppingItemAddition({ summary }))
      return SucceededFetchShopping({ items })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
      recoverWith((isServerReachable) => FailedFetchShopping({ isServerReachable }))
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
      recoverWith((isServerReachable) => FailedFetchShopping({ isServerReachable }))
    ),
})
