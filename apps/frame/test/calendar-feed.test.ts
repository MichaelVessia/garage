import { assert, describe, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/integration-http/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as TestClock from 'effect/testing/TestClock'

import { CalendarDate, IanaTimezone, calendarDateStartUtc } from '#shared'

import { CalendarFeedLive } from '../src/calendar/http.js'
import { CalendarConfig, CalendarFeed } from '../src/calendar/services.js'
import { FrameTimezone } from '../src/settings.js'
import fixture from './fixtures/synthetic.ics?raw'

const timezone = IanaTimezone.make('America/New_York')
const secretUrl = 'https://calendar.example.test/private-secret-token/basic.ics'
const range = {
  start: calendarDateStartUtc(CalendarDate.make('2026-11-01'), timezone),
  end: calendarDateStartUtc(CalendarDate.make('2026-11-22'), timezone),
}

const BaseLayer = Layer.mergeAll(
  Layer.succeed(CalendarConfig, { icsUrl: Redacted.make(secretUrl) }),
  Layer.succeed(FrameTimezone, { timezone })
)

const icsResponse = { status: 200, body: fixture, headers: new Headers({ 'content-type': 'text/calendar' }) }

describe('CalendarFeedLive', () => {
  it.effect('fetches the feed once per cache window', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => icsResponse)
      const feed = yield* CalendarFeed.pipe(
        Effect.provide(CalendarFeedLive.pipe(Layer.provide(Layer.merge(BaseLayer, fake.layer))))
      )

      const first = yield* feed.occurrences(range)
      yield* feed.occurrences(range)
      yield* TestClock.adjust('6 minutes')
      yield* feed.occurrences(range)

      assert.strictEqual(first.length, 6)
      assert.deepStrictEqual(
        (yield* Ref.get(fake.requests)).map((request) => [request.method, request.url]),
        [
          ['GET', secretUrl],
          ['GET', secretUrl],
        ]
      )
    })
  )

  it.effect('serves the last good feed when a refresh fails', () =>
    Effect.gen(function* () {
      let calls = 0
      const fake = yield* makeRecordingHttpClient(() => {
        calls += 1
        return calls === 1 ? icsResponse : { status: 503 }
      })
      const feed = yield* CalendarFeed.pipe(
        Effect.provide(CalendarFeedLive.pipe(Layer.provide(Layer.merge(BaseLayer, fake.layer))))
      )

      yield* feed.occurrences(range)
      yield* TestClock.adjust('6 minutes')
      const stale = yield* feed.occurrences(range)

      assert.strictEqual(stale.length, 6)
    })
  )

  it.effect('fails without exposing the secret address when no copy is cached', () =>
    Effect.gen(function* () {
      const fake = yield* makeRecordingHttpClient(() => ({ status: 404 }))
      const feed = yield* CalendarFeed.pipe(
        Effect.provide(CalendarFeedLive.pipe(Layer.provide(Layer.merge(BaseLayer, fake.layer))))
      )

      const error = yield* Effect.flip(feed.occurrences(range))

      assert.strictEqual(error.code, 'CALENDAR_HTTP_ERROR')
      assert.notInclude(`${error.message} ${error.fix}`, 'private-secret-token')
    })
  )
})
