import { assert, describe, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/integration-http/testing'
import type { RecordingHttpResponse } from '@garage/integration-http/testing'
import * as Arr from 'effect/Array'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Jwt from 'effect/jose/Jwt'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/testing/TestClock'

import { CalendarDate, IanaTimezone, calendarDateStartUtc } from '#shared'
import type { CalendarEvent } from '#shared'

import { CalendarFeedLive } from '../src/calendar/http.js'
import { CalendarConfig, CalendarConfigLive, CalendarFeed } from '../src/calendar/services.js'
import { FrameTimezone } from '../src/settings.js'
import {
  accessToken,
  calendarId,
  eventsPath,
  googleResponse,
  makeServiceAccount,
  tokenUri,
} from './fixtures/google-calendar.js'

const timezone = IanaTimezone.make('America/New_York')

const windowOf = (from: string, to: string) => ({
  start: calendarDateStartUtc(CalendarDate.make(from), timezone),
  end: calendarDateStartUtc(CalendarDate.make(to), timezone),
})

const range = windowOf('2026-11-01', '2026-11-22')

const summary = (event: CalendarEvent) =>
  event._tag === 'TimedEvent'
    ? `${event.title} ${DateTime.formatIso(event.start)} ${event.color ?? '-'}`
    : `${event.title} ${event.startDate}..${event.endDate} ${event.color ?? '-'}`

const makeFeed = Effect.fn('test.makeFeed')(function* (respond: (url: URL) => RecordingHttpResponse = googleResponse) {
  const serviceAccount = yield* makeServiceAccount
  const fake = yield* makeRecordingHttpClient((_method, url) => respond(url))

  const feed = yield* CalendarFeed.pipe(
    Effect.provide(
      CalendarFeedLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(CalendarConfig, { calendarId, serviceAccount }),
            Layer.succeed(FrameTimezone, { timezone }),
            fake.layer
          )
        )
      )
    )
  )

  return { feed, requests: fake.requests }
})

const isEvents = (url: string) => new URL(url).pathname === eventsPath

describe('CalendarFeedLive', () => {
  it.effect('maps Google colours, timed and all-day events in start order, and drops cancelled instances', () =>
    Effect.gen(function* () {
      const { feed } = yield* makeFeed()

      const events = yield* feed.occurrences(range)

      assert.deepStrictEqual(Arr.map(events, summary), [
        'Swim lesson 2026-11-02T22:00:00.000Z peacock',
        'School call 2026-11-03T15:00:00.000Z -',
        'Grandparents visiting 2026-11-05..2026-11-08 tomato',
        '(No title) 2026-11-06T17:00:00.000Z -',
      ])
      assert.strictEqual(events[0]?.location, 'Community pool')
      assert.strictEqual(events[0]?.id, 'swim_20261102T220000Z')
    })
  )

  it.effect('signs in as the service account and asks Google for expanded events in the window', () =>
    Effect.gen(function* () {
      const { feed, requests } = yield* makeFeed()

      yield* feed.occurrences(range)

      const [signIn, list] = yield* Ref.get(requests)
      assert.strictEqual(signIn?.method, 'POST')
      assert.strictEqual(signIn?.url, tokenUri)

      const form = new URLSearchParams(
        P.isTagged(signIn?.raw.body, 'Uint8Array') ? new TextDecoder().decode(signIn.raw.body.body) : ''
      )

      assert.strictEqual(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
      const assertion = yield* Jwt.decodeUnverified(form.get('assertion') ?? '')
      assert.strictEqual(assertion.protectedHeader.alg, 'RS256')
      assert.deepInclude(assertion.claims, {
        iss: 'frame@example-project.iam.example.test',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        aud: tokenUri,
      })
      assert.strictEqual(Number(assertion.claims.exp) - Number(assertion.claims.iat), 3600)
      const query = new URL(list?.url ?? '').searchParams
      assert.strictEqual(query.get('singleEvents'), 'true')
      assert.strictEqual(query.get('timeMin'), DateTime.formatIso(range.start))
      assert.strictEqual(query.get('timeMax'), DateTime.formatIso(range.end))
      assert.strictEqual(list?.raw.headers.authorization, `Bearer ${accessToken}`)
    })
  )

  it.effect('reads each window once per cache window and reuses the access token', () =>
    Effect.gen(function* () {
      const { feed, requests } = yield* makeFeed()

      yield* feed.occurrences(range)
      yield* feed.occurrences(range)
      yield* feed.occurrences(windowOf('2026-11-02', '2026-11-05'))
      yield* TestClock.adjust('6 minutes')
      yield* feed.occurrences(range)

      const urls = Arr.map(yield* Ref.get(requests), (request) => request.url)
      assert.strictEqual(Arr.filter(urls, (url) => url === tokenUri).length, 1)
      assert.strictEqual(Arr.filter(urls, isEvents).length, 3)
    })
  )

  it.effect('serves the last good copy when a refresh fails', () =>
    Effect.gen(function* () {
      let lists = 0

      const { feed } = yield* makeFeed((url) => {
        if (url.pathname === eventsPath) {
          lists += 1

          if (lists > 1) {
            return { status: 403, body: { error: { code: 403, message: 'Rate Limit Exceeded' } } }
          }
        }

        return googleResponse(url)
      })

      yield* feed.occurrences(range)
      yield* TestClock.adjust('6 minutes')
      const stale = yield* feed.occurrences(range)

      assert.strictEqual(stale.length, 4)
    })
  )

  it.effect('signs in again after Google rejects the access token', () =>
    Effect.gen(function* () {
      let lists = 0

      const { feed, requests } = yield* makeFeed((url) => {
        if (url.pathname === eventsPath) {
          lists += 1

          if (lists === 1) {
            return { status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } }
          }
        }

        return googleResponse(url)
      })

      const error = yield* Effect.flip(feed.occurrences(range))
      yield* feed.occurrences(range)

      assert.strictEqual(error.code, 'CALENDAR_HTTP_ERROR')
      const urls = Arr.map(yield* Ref.get(requests), (request) => request.url)
      assert.strictEqual(Arr.filter(urls, (url) => url === tokenUri).length, 2)
    })
  )

  it.effect('fails without exposing the key or token when the calendar is not shared', () =>
    Effect.gen(function* () {
      const { feed } = yield* makeFeed((url) =>
        url.pathname === eventsPath
          ? { status: 404, body: { error: { code: 404, message: `Not Found: ${accessToken}` } } }
          : googleResponse(url)
      )

      const error = yield* Effect.flip(feed.occurrences(range))

      assert.strictEqual(error.code, 'CALENDAR_HTTP_ERROR')
      assert.include(error.message, '404')
      assert.notInclude(`${error.message} ${error.fix}`, accessToken)
    })
  )
})

const configFrom = (env: Record<string, string>) =>
  CalendarConfig.pipe(
    Effect.provide(CalendarConfigLive.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))))
  )

describe('CalendarConfigLive', () => {
  it.effect('reads the calendar ID and service account key file', () =>
    Effect.gen(function* () {
      const config = yield* configFrom({
        GOOGLE_CALENDAR_ID: calendarId,
        GOOGLE_SERVICE_ACCOUNT_KEY:
          '{"type":"service_account","client_email":"frame@example-project.iam.example.test","private_key":"synthetic-private-key"}',
      })

      assert.strictEqual(config.calendarId, calendarId)
      assert.strictEqual(config.serviceAccount.clientEmail, 'frame@example-project.iam.example.test')
      assert.strictEqual(Redacted.value(config.serviceAccount.privateKey), 'synthetic-private-key')
      assert.strictEqual(config.serviceAccount.tokenUri, 'https://oauth2.googleapis.com/token')
    })
  )

  it.effect('rejects a key that is not a service account key file without echoing it', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        configFrom({ GOOGLE_CALENDAR_ID: calendarId, GOOGLE_SERVICE_ACCOUNT_KEY: 'not-json-secret' })
      )

      assert.strictEqual(error.code, 'FRAME_ENV_INVALID')
      assert.notInclude(`${error.message} ${error.fix}`, 'not-json-secret')
    })
  )
})
