import { makeConfigReaders } from '@garage/integration-http'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { EventColor } from '#shared'
import type { CalendarEvent } from '#shared'

import { envInvalid, envMissing } from '../errors.js'
import type { CalendarError } from '../errors.js'

/** An instant range; `end` is exclusive. */
export interface InstantRange {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

/** The Google service account the frame signs in as. */
interface ServiceAccount {
  readonly clientEmail: string
  readonly privateKey: Redacted.Redacted
  readonly tokenUri: string
}

/**
 * The family calendar's Google Calendar ID, the service account it is shared with, and the calendar's own colour.
 * Google keeps a calendar's colour per viewer, so the frame cannot read the household's choice and is told it.
 */
export class CalendarConfig extends Context.Service<
  CalendarConfig,
  {
    readonly calendarId: string
    readonly serviceAccount: ServiceAccount
    readonly calendarColor: Option.Option<EventColor>
  }
>()('@garage/frame/calendar/services/CalendarConfig') {}

/** Occurrences of the family calendar inside an instant range. */
export class CalendarFeed extends Context.Service<
  CalendarFeed,
  {
    readonly occurrences: (range: InstantRange) => Effect.Effect<ReadonlyArray<CalendarEvent>, CalendarError>
  }
>()('@garage/frame/calendar/services/CalendarFeed') {}

const { readRequiredSecret, readRequiredString } = makeConfigReaders(envMissing)

// The JSON key file Google issues for a service account; other fields are ignored.
const ServiceAccountKey = Schema.fromJsonString(
  Schema.Struct({
    client_email: Schema.NonEmptyString,
    private_key: Schema.NonEmptyString,
    token_uri: Schema.optional(Schema.NonEmptyString),
  })
)

const readServiceAccount = Effect.fn('frame.calendar.readServiceAccount')(function* () {
  const key = yield* readRequiredSecret('GOOGLE_SERVICE_ACCOUNT_KEY')

  const decoded = yield* key.pipe(
    Redacted.value,
    Schema.decodeEffect(ServiceAccountKey),
    Effect.mapError(() =>
      envInvalid({
        variable: 'GOOGLE_SERVICE_ACCOUNT_KEY',
        reason: 'expected the JSON key file with client_email and private_key',
      })
    )
  )

  return {
    clientEmail: decoded.client_email,
    privateKey: Redacted.make(decoded.private_key),
    tokenUri: decoded.token_uri ?? 'https://oauth2.googleapis.com/token',
  } satisfies ServiceAccount
})

// Uncoloured events show in this colour, as they do in Google Calendar; unset keeps them neutral.
const readCalendarColor = Effect.fn('frame.calendar.readCalendarColor')(function* () {
  const raw = yield* Config.String('GOOGLE_CALENDAR_COLOR').pipe(
    Config.option,
    Effect.mapError(() => envMissing('GOOGLE_CALENDAR_COLOR'))
  )

  return yield* Option.match(raw, {
    onNone: () => Effect.succeed(Option.none<EventColor>()),
    onSome: (value) =>
      Schema.decodeEffect(EventColor)(Str.toLowerCase(Str.trim(value))).pipe(
        Effect.mapError(() => envInvalid({ variable: 'GOOGLE_CALENDAR_COLOR', reason: 'expected a #rrggbb colour' })),
        Effect.asSome
      ),
  })
})

export const CalendarConfigLive: Layer.Layer<CalendarConfig, CalendarError> = Layer.effect(
  CalendarConfig,
  Effect.gen(function* () {
    const calendarId = yield* readRequiredString('GOOGLE_CALENDAR_ID')
    const serviceAccount = yield* readServiceAccount()
    const calendarColor = yield* readCalendarColor()

    return CalendarConfig.of({ calendarId, serviceAccount, calendarColor })
  })
)
