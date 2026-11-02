import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { CalendarDate, IanaTimezone, calendarDateStartUtc } from '#shared'
import type { CalendarEvent } from '#shared'

import { expandCalendar } from '../src/calendar/ics.js'
import fixture from './fixtures/synthetic.ics?raw'

const timezone = IanaTimezone.make('America/New_York')
const range = {
  start: calendarDateStartUtc(CalendarDate.make('2026-11-01'), timezone),
  end: calendarDateStartUtc(CalendarDate.make('2026-11-22'), timezone),
}

const summary = (event: CalendarEvent) =>
  event._tag === 'TimedEvent'
    ? `${event.title} ${DateTime.formatIso(event.start)} ${DateTime.formatIso(event.end)}`
    : `${event.title} ${event.startDate}..${event.endDate}`

describe('expandCalendar', () => {
  it.effect('expands recurrences, overrides, all-day, UTC, floating, and straddling events in order', () =>
    Effect.gen(function* () {
      const events = yield* expandCalendar(fixture, range, timezone)

      assert.deepStrictEqual(events.map(summary), [
        'Halloween party 2026-11-01T02:00:00.000Z 2026-11-01T04:30:00.000Z',
        'Swim lesson 2026-11-02T22:00:00.000Z 2026-11-02T23:00:00.000Z',
        'School call 2026-11-03T15:00:00.000Z 2026-11-03T15:30:00.000Z',
        'Grandparents visiting 2026-11-05..2026-11-08',
        'Floating lunch 2026-11-06T17:00:00.000Z 2026-11-06T18:00:00.000Z',
        'Swim lesson (late) 2026-11-16T23:30:00.000Z 2026-11-17T00:30:00.000Z',
      ])
    })
  )

  it.effect('gives each occurrence of a series a distinct id and keeps the location', () =>
    Effect.gen(function* () {
      const events = yield* expandCalendar(fixture, range, timezone)
      const swims = events.filter((event) => event.title.startsWith('Swim lesson'))

      assert.strictEqual(new Set(swims.map((event) => event.id)).size, swims.length)
      assert.deepStrictEqual(
        swims.map((event) => event.location),
        ['Community pool', 'Community pool']
      )
    })
  )

  it.effect('clips to the window: an all-day event overlapping the start is kept, later ones are dropped', () =>
    Effect.gen(function* () {
      const narrow = {
        start: calendarDateStartUtc(CalendarDate.make('2026-11-07'), timezone),
        end: calendarDateStartUtc(CalendarDate.make('2026-11-08'), timezone),
      }
      const events = yield* expandCalendar(fixture, narrow, timezone)

      assert.deepStrictEqual(events.map(summary), ['Grandparents visiting 2026-11-05..2026-11-08'])
    })
  )

  it.effect('fails with a decode error for data that is not iCalendar', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(expandCalendar('not a calendar', range, timezone))

      assert.isTrue(Exit.isFailure(exit))
    })
  )
})
