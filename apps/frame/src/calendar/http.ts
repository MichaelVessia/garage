import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import { calendarHttpError, calendarUnreachable } from '../errors.js'
import { FrameTimezone } from '../settings.js'
import { expandCalendar } from './ics.js'
import type { InstantRange } from './ics.js'
import { CalendarConfig, CalendarFeed } from './services.js'

// The frame polls every few minutes; Google regenerates the feed on a similar cadence.
const FEED_TTL = Duration.minutes(5)

interface CachedFeed {
  readonly ics: string
  readonly fetchedAtMillis: number
}

export const CalendarFeedLive = Layer.effect(
  CalendarFeed,
  Effect.gen(function* () {
    const { icsUrl } = yield* CalendarConfig
    const { timezone } = yield* FrameTimezone
    const client = yield* HttpClient.HttpClient
    const cache = yield* Ref.make(Option.none<CachedFeed>())

    const download = Effect.fn('frame.calendar.download')(function* () {
      const response = yield* client
        .execute(HttpClientRequest.get(Redacted.value(icsUrl)))
        .pipe(Effect.mapError(() => calendarUnreachable('The calendar feed could not be reached')))
      if (response.status < 200 || response.status >= 300) {
        return yield* calendarHttpError(response.status)
      }
      return yield* response.text.pipe(
        Effect.mapError(() => calendarUnreachable('The calendar feed response could not be read'))
      )
    })

    // Serve a fresh copy when possible and fall back to the last good copy when Google is unavailable.
    const feed = Effect.fn('frame.calendar.feed')(function* () {
      const now = yield* Clock.currentTimeMillis
      const cached = yield* Ref.get(cache)
      if (Option.isSome(cached) && now - cached.value.fetchedAtMillis < Duration.toMillis(FEED_TTL)) {
        return cached.value.ics
      }
      return yield* download().pipe(
        Effect.tap((ics) => Ref.set(cache, Option.some({ ics, fetchedAtMillis: now }))),
        Effect.catch((error) =>
          Option.match(cached, {
            onNone: () => Effect.fail(error),
            onSome: (stale) => Effect.succeed(stale.ics),
          })
        )
      )
    })

    return CalendarFeed.of({
      occurrences: Effect.fn('frame.calendar.occurrences')(function* (range: InstantRange) {
        const ics = yield* feed()
        return yield* expandCalendar(ics, range, timezone)
      }),
    })
  })
)
