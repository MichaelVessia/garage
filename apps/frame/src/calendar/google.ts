import type { Event, EventDateTime } from '@distilled.cloud/google-workspace/calendar_v3'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'

import { CalendarDate, calendarDateStartUtc } from '#shared'
import type { AllDayEvent, CalendarEvent, EventColor, IanaTimezone, TimedEvent } from '#shared'

import { calendarDecodeError } from '../errors.js'
import type { InstantRange } from './services.js'

// Google's event palette by `colorId`; the frame draws each with Google Calendar's own shade.
const COLORS = HashMap.fromIterable<string, EventColor>(
  R.toEntries({
    '1': 'lavender',
    '2': 'sage',
    '3': 'grape',
    '4': 'flamingo',
    '5': 'banana',
    '6': 'tangerine',
    '7': 'peacock',
    '8': 'graphite',
    '9': 'blueberry',
    '10': 'basil',
    '11': 'tomato',
  } satisfies Record<string, EventColor>)
)

const text = (value: Option.Option<string>): Option.Option<string> =>
  Option.filter(
    Option.map(value, (raw) => raw.trim()),
    (trimmed) => trimmed !== ''
  )

const decodeDate = Schema.decodeUnknownOption(CalendarDate)

const instantOf = (time: Option.Option<EventDateTime>): Option.Option<DateTime.Utc> =>
  Option.flatMap(
    Option.flatMap(time, (value) => Option.fromNullishOr(value.dateTime)),
    (iso) => DateTime.make(iso)
  )

const dateOf = (time: Option.Option<EventDateTime>): Option.Option<CalendarDate> =>
  Option.flatMap(
    Option.flatMap(time, (value) => Option.fromNullishOr(value.date)),
    decodeDate
  )

// Timed events carry RFC 3339 instants; all-day events carry local dates with an exclusive end.
const toCalendarEvent = (event: Event): Option.Option<CalendarEvent> =>
  Option.flatMap(Option.fromNullishOr(event.id), (id) => {
    const details = {
      id,
      title: Option.fromNullishOr(event.summary).pipe(
        text,
        Option.getOrElse(() => '(No title)')
      ),
      location: Option.fromNullishOr(event.location).pipe(text, Option.getOrNull),
      color: Option.fromNullishOr(event.colorId).pipe(
        Option.flatMap((colorId) => HashMap.get(COLORS, colorId)),
        Option.getOrNull
      ),
    }
    const startTime = Option.fromNullishOr(event.start)
    const endTime = Option.fromNullishOr(event.end)
    const timed = Option.all({ start: instantOf(startTime), end: instantOf(endTime) })
    const allDay = Option.all({ startDate: dateOf(startTime), endDate: dateOf(endTime) })
    return Option.orElse(
      Option.map(timed, ({ start, end }): TimedEvent => ({ _tag: 'TimedEvent', ...details, start, end })),
      () =>
        Option.map(allDay, ({ startDate, endDate }): AllDayEvent => ({
          _tag: 'AllDayEvent',
          ...details,
          startDate,
          endDate,
        }))
    )
  })

const startOf = (event: CalendarEvent, timezone: IanaTimezone): DateTime.Utc =>
  Match.valueTags(event, {
    TimedEvent: (timed) => timed.start,
    AllDayEvent: (allDay) => calendarDateStartUtc(allDay.startDate, timezone),
  })

const byStart = (timezone: IanaTimezone): Order.Order<CalendarEvent> =>
  Order.mapInput(DateTime.Order, (event: CalendarEvent) => startOf(event, timezone))

/** The request window Google Calendar expects for `range`. */
export const listWindow = (range: InstantRange) => ({
  timeMin: DateTime.formatIso(range.start),
  timeMax: DateTime.formatIso(range.end),
})

/**
 * Map expanded Google Calendar events to occurrences sorted by start, placing all-day events in the frame timezone.
 * Cancelled instances are dropped; an event without a usable start and end fails the whole response.
 */
export const toOccurrences = (
  events: ReadonlyArray<Event>,
  timezone: IanaTimezone
): Effect.Effect<ReadonlyArray<CalendarEvent>, ReturnType<typeof calendarDecodeError>> =>
  Effect.forEach(
    Arr.filter(events, (event) => event.status !== 'cancelled'),
    (event) =>
      Option.match(toCalendarEvent(event), {
        onNone: () => Effect.fail(calendarDecodeError('Google Calendar returned an event without a usable time')),
        onSome: Effect.succeed,
      }),
    { concurrency: 1 }
  ).pipe(Effect.map((occurrences) => Arr.sort(occurrences, byStart(timezone))))
