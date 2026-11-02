import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import type * as RpcClientError from 'effect/rpc/RpcClientError'
import * as Schema from 'effect/Schema'
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
import { Message } from './message.js'

/** Services the frame's commands need. */
export type CommandServices = Api | HttpClient.HttpClient

/** Commands the frame runs. */
export type Commands = ReadonlyArray<Command.Command<Message, never, CommandServices>>

// Days of events the Today screen and ambient clock keep loaded.
const UPCOMING_DAYS = 3
const SETTINGS_RETRY = Duration.seconds(5)

const Health = Schema.Struct({ version: Schema.String })

// An upstream failure means the frame server answered; a client error means it could not be reached.
const recoverWith =
  <B>(toFailure: (isServerReachable: boolean) => B) =>
  <A, R>(
    effect: Effect.Effect<A, UpstreamUnavailable | RpcClientError.RpcClientError, R>
  ): Effect.Effect<A | B, never, R> =>
    effect.pipe(
      Effect.catchTags({
        UpstreamUnavailable: () => Effect.succeed(toFailure(true)),
        RpcClientError: () => Effect.succeed(toFailure(false)),
      })
    )

const fetchSettings = Effect.fn('frame.fetchSettings')(function* () {
  const api = yield* Api
  const settings = yield* api.GetSettings()

  return Message.SucceededFetchSettings({ settings })
})

export const FetchSettings = Command.define('FetchSettings', {
  messages: [Message.SucceededFetchSettings, Message.FailedFetchSettings],
  execute: fetchSettings().pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchSettings', failure)),
    recoverWith((isServerReachable) => Message.FailedFetchSettings({ isServerReachable }))
  ),
})

// Without settings the frame shows only its start screen, so retry steadily until the server answers.
export const RetrySettings = Command.define('RetrySettings', {
  messages: [Message.SucceededFetchSettings, Message.FailedFetchSettings],
  execute: Effect.sleep(SETTINGS_RETRY).pipe(
    Effect.andThen(fetchSettings()),
    Effect.tapError((failure) => Effect.logWarning('FailedFetchSettings', failure)),
    recoverWith((isServerReachable) => Message.FailedFetchSettings({ isServerReachable }))
  ),
})

export const CheckVersion = Command.define('CheckVersion', {
  messages: [Message.CheckedVersion, Message.FailedCheckVersion],
  execute: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get('/health')
    const health = yield* HttpClientResponse.schemaBodyJson(Health)(response)

    return Message.CheckedVersion({ version: health.version })
  }).pipe(
    Effect.tapError((failure) => Effect.logInfo('Frame server unreachable', failure)),
    Effect.orElseSucceed(() => Message.FailedCheckVersion())
  ),
})

export const ReloadPage = Command.define('ReloadPage', {
  messages: [Message.StartedReload],
  execute: Effect.sync(() => {
    globalThis.location.reload()

    return Message.StartedReload()
  }),
})

export const FetchUpcoming = Command.define('FetchUpcoming', {
  args: { from: CalendarDate },
  messages: [Message.SucceededFetchUpcoming, Message.FailedFetchUpcoming],
  execute: ({ from }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const events = yield* api.GetCalendar(CalendarWindow.make({ from, to: addCalendarDays(from, UPCOMING_DAYS) }))

      return Message.SucceededFetchUpcoming({ events })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchUpcoming', failure)),
      recoverWith((isServerReachable) => Message.FailedFetchUpcoming({ isServerReachable }))
    ),
})

export const FetchWeek = Command.define('FetchWeek', {
  args: { from: CalendarDate },
  messages: [Message.SucceededFetchWeek, Message.FailedFetchWeek],
  execute: ({ from }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const events = yield* api.GetCalendar(CalendarWindow.make({ from, to: addCalendarDays(from, 7) }))

      return Message.SucceededFetchWeek({ from, events })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchWeek', failure)),
      recoverWith((isServerReachable) => Message.FailedFetchWeek({ isServerReachable }))
    ),
})

export const FetchWeather = Command.define('FetchWeather', {
  messages: [Message.SucceededFetchWeather, Message.FailedFetchWeather],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const weather = yield* api.GetWeather()

    return Message.SucceededFetchWeather({ weather })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchWeather', failure)),
    recoverWith((isServerReachable) => Message.FailedFetchWeather({ isServerReachable }))
  ),
})

export const FetchShopping = Command.define('FetchShopping', {
  messages: [Message.SucceededFetchShopping, Message.FailedFetchShopping],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const items = yield* api.GetShopping()

    return Message.SucceededFetchShopping({ items })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
    recoverWith((isServerReachable) => Message.FailedFetchShopping({ isServerReachable }))
  ),
})

export const FetchMedia = Command.define('FetchMedia', {
  messages: [Message.SucceededFetchMedia, Message.FailedFetchMedia],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const media = yield* api.GetMedia()

    return Message.SucceededFetchMedia({ media })
  }).pipe(
    Effect.tapError((failure) => Effect.logWarning('FailedFetchMedia', failure)),
    recoverWith((isServerReachable) => Message.FailedFetchMedia({ isServerReachable }))
  ),
})

export const RunMediaAction = Command.define('RunMediaAction', {
  args: { action: MediaAction },
  messages: [Message.SucceededFetchMedia, Message.FailedMediaAction],
  execute: ({ action }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const media = yield* api.RunMediaAction(action)

      return Message.SucceededFetchMedia({ media })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedMediaAction', failure)),
      Effect.orElseSucceed(() => Message.FailedMediaAction())
    ),
})

export const AddShoppingItem = Command.define('AddShoppingItem', {
  args: { summary: Schema.String },
  messages: [Message.SucceededFetchShopping, Message.FailedFetchShopping],
  execute: ({ summary }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const items = yield* api.AddShoppingItem(ShoppingItemAddition.make({ summary }))

      return Message.SucceededFetchShopping({ items })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
      recoverWith((isServerReachable) => Message.FailedFetchShopping({ isServerReachable }))
    ),
})

export const UpdateShoppingItem = Command.define('UpdateShoppingItem', {
  args: { uid: Schema.String, status: ShoppingItemStatus },
  messages: [Message.SucceededFetchShopping, Message.FailedFetchShopping],
  execute: ({ uid, status }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const items = yield* api.UpdateShoppingItem(ShoppingItemUpdate.make({ uid, status }))

      return Message.SucceededFetchShopping({ items })
    }).pipe(
      Effect.tapError((failure) => Effect.logWarning('FailedFetchShopping', failure)),
      recoverWith((isServerReachable) => Message.FailedFetchShopping({ isServerReachable }))
    ),
})
