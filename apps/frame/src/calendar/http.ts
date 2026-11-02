import { Credentials } from '@distilled.cloud/google-workspace'
import { getCalendars, listEvents } from '@distilled.cloud/google-workspace/calendar_v3'
import type { GetCalendarsError, ListEventsError } from '@distilled.cloud/google-workspace/calendar_v3'
import * as Clock from 'effect/Clock'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Signature from 'effect/crypto/Signature'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Jwk from 'effect/jose/Jwk'
import * as Jwt from 'effect/jose/Jwt'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import * as R from 'effect/Record'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import type { CalendarEvent } from '#shared'

import { calendarDecodeError, calendarHttpError, calendarUnreachable, envInvalid } from '../errors.js'
import type { CalendarError } from '../errors.js'
import { FrameTimezone } from '../settings.js'
import { labelColors, listWindow, toOccurrences } from './google.js'
import { CalendarConfig, CalendarFeed } from './services.js'
import type { InstantRange } from './services.js'

// The frame polls every few minutes; each window is read from Google at most this often.
const FEED_TTL = Duration.minutes(5)

// A window nobody has asked for in this long is dropped instead of kept as a fallback.
const STALE_LIMIT = Duration.days(1)

// Google issues access tokens for at most an hour; the frame renews them a little early.
const TOKEN_LIFETIME = Duration.hours(1)
const TOKEN_MARGIN = Duration.minutes(5)
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

const Assertion = Schema.Struct({
  iss: Schema.String,
  scope: Schema.String,
  aud: Schema.String,
  iat: Schema.Finite,
  exp: Schema.Finite,
})

const TokenResponse = Schema.Struct({ access_token: Schema.NonEmptyString, expires_in: Schema.Finite })

const SignatureLive = Signature.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))

interface CachedToken {
  readonly token: Redacted.Redacted
  readonly expiresAtMillis: number
}

interface CachedWindow {
  readonly events: ReadonlyArray<CalendarEvent>
  readonly fetchedAtMillis: number
}

// Shared SDK errors carry no status, so it is recovered from the error class.
const STATUS_BY_TAG = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  Locked: 423,
  UnprocessableEntity: 422,
  TooManyRequests: 429,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} satisfies Record<string, number>

// Google's error messages can echo request details, so only the status survives.
const toCalendarError = (error: ListEventsError | GetCalendarsError): CalendarError =>
  Match.value(error).pipe(
    Match.tag('HttpClientError', () => calendarUnreachable({ message: 'Google Calendar could not be reached' })),
    Match.tag('GoogleWorkspaceParseError', () =>
      calendarDecodeError({ message: 'Google Calendar returned an unreadable response' })
    ),
    Match.tag('UnknownGoogleWorkspaceError', (unknown) => calendarHttpError(unknown.code ?? 500)),
    Match.orElse((known) => calendarHttpError(Option.getOrElse(R.get(STATUS_BY_TAG, known._tag), () => 500)))
  )

const windowKey = (range: InstantRange): string => `${DateTime.formatIso(range.start)}/${DateTime.formatIso(range.end)}`

export const CalendarFeedLive: Layer.Layer<
  CalendarFeed,
  CalendarError,
  CalendarConfig | FrameTimezone | HttpClient.HttpClient
> = Layer.effect(
  CalendarFeed,
  Effect.gen(function* () {
    const { calendarId, serviceAccount, calendarColor } = yield* CalendarConfig
    const { timezone } = yield* FrameTimezone
    const client = yield* HttpClient.HttpClient
    const signature = yield* Signature.Signature

    const signingKey = yield* Jwk.importPkcs8(serviceAccount.privateKey, 'RS256').pipe(
      Effect.mapError(() =>
        envInvalid({ variable: 'GOOGLE_SERVICE_ACCOUNT_KEY', reason: 'private_key is not a PKCS #8 RSA key' })
      )
    )

    const tokens = yield* Ref.make(Option.none<CachedToken>())
    const windows = yield* Ref.make(HashMap.empty<string, CachedWindow>())

    // Sign in as the service account with a signed JWT assertion (OAuth 2.0 JWT bearer grant).
    const signIn = Effect.fn('frame.calendar.signIn')(function* (nowMillis: number) {
      const issuedAt = Math.floor(nowMillis / 1000)

      const assertion = yield* Jwt.sign(
        Assertion,
        {
          iss: serviceAccount.clientEmail,
          scope: SCOPE,
          aud: serviceAccount.tokenUri,
          iat: issuedAt,
          exp: issuedAt + Duration.toSeconds(TOKEN_LIFETIME),
        },
        signingKey
      ).pipe(
        Effect.provideService(Signature.Signature, signature),
        Effect.mapError(() => calendarDecodeError({ message: 'The Google sign-in assertion could not be signed' }))
      )

      const response = yield* client
        .execute(
          HttpClientRequest.post(serviceAccount.tokenUri).pipe(
            HttpClientRequest.bodyUrlParams({ grant_type: JWT_BEARER, assertion: Redacted.value(assertion) })
          )
        )
        .pipe(Effect.mapError(() => calendarUnreachable({ message: 'Google sign-in could not be reached' })))

      if (response.status < 200 || response.status >= 300) {
        return yield* calendarHttpError(response.status)
      }

      const granted = yield* HttpClientResponse.schemaBodyJson(TokenResponse)(response).pipe(
        Effect.mapError(() => calendarDecodeError({ message: 'Google sign-in returned an unreadable token' }))
      )

      return {
        token: Redacted.make(granted.access_token),
        expiresAtMillis: nowMillis + granted.expires_in * 1000 - Duration.toMillis(TOKEN_MARGIN),
      } satisfies CachedToken
    })

    const accessToken = Effect.fn('frame.calendar.accessToken')(function* () {
      const now = yield* Clock.currentTimeMillis
      const cached = yield* Ref.get(tokens)

      if (Option.isSome(cached) && now < cached.value.expiresAtMillis) {
        return cached.value.token
      }

      const fresh = yield* signIn(now)
      yield* Ref.set(tokens, Option.some(fresh))

      return fresh.token
    })

    const download = Effect.fn('frame.calendar.download')(function* (range: InstantRange) {
      const token = yield* accessToken()

      // The calendar carries the event labels; reading it with the events keeps label colour changes current.
      const { events, calendar } = yield* Effect.all(
        {
          events: listEvents
            .items({ calendarId, ...listWindow(range), singleEvents: true, maxResults: 2500 })
            .pipe(Stream.runCollect),
          calendar: getCalendars({ calendarId }),
        },
        { concurrency: 2 }
      ).pipe(
        Effect.provideService(Credentials, Effect.succeed({ accessToken: token })),
        Effect.provideService(HttpClient.HttpClient, client),
        // A rejected token is signed in again on the next request.
        Effect.tapError((error) => (P.isTagged(error, 'Unauthorized') ? Ref.set(tokens, Option.none()) : Effect.void)),
        Effect.mapError(toCalendarError)
      )

      const labels = labelColors(calendar.labelProperties?.eventLabels ?? [])

      return yield* toOccurrences(events, { timezone, palette: { labels, calendarColor } })
    })

    return CalendarFeed.of({
      // Serve a fresh copy when possible and fall back to the last good copy when Google is unavailable.
      occurrences: Effect.fn('frame.calendar.occurrences')(function* (range: InstantRange) {
        const key = windowKey(range)
        const now = yield* Clock.currentTimeMillis
        const cached = yield* Ref.get(windows).pipe(Effect.map(HashMap.get(key)))

        if (Option.isSome(cached) && now - cached.value.fetchedAtMillis < Duration.toMillis(FEED_TTL)) {
          return cached.value.events
        }

        return yield* download(range).pipe(
          Effect.tap((events) =>
            Ref.update(windows, (current) =>
              HashMap.set(
                HashMap.filter(current, (entry) => now - entry.fetchedAtMillis < Duration.toMillis(STALE_LIMIT)),
                key,
                { events, fetchedAtMillis: now }
              )
            )
          ),
          Effect.catch((error) =>
            Option.match(cached, {
              onNone: () => Effect.fail(error),
              onSome: (stale) => Effect.succeed(stale.events),
            })
          )
        )
      }),
    })
  })
).pipe(Layer.provide(SignatureLive))
