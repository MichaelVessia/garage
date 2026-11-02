import type { Event, EventDateTime, EventLabel } from '@distilled.cloud/google-workspace/calendar_v3'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { CalendarDate, EventColor, calendarDateStartUtc } from '#shared'
import type { AllDayEvent, CalendarEvent, IanaTimezone, TimedEvent } from '#shared'

import { calendarDecodeError } from '../errors.js'
import type { InstantRange } from './services.js'

// Google Calendar's shades for the classic `colorId` palette, as its web app draws them.
const CLASSIC_COLORS = HashMap.fromIterable<string, EventColor>(
  R.toEntries({
    '1': '#7986cb',
    '2': '#33b679',
    '3': '#8e24aa',
    '4': '#e67c73',
    '5': '#f6bf26',
    '6': '#f4511e',
    '7': '#039be5',
    '8': '#616161',
    '9': '#3f51b5',
    '10': '#0b8043',
    '11': '#d50000',
  })
)

/** What an event's colour can come from besides its own `colorId`. */
export interface CalendarPalette {
  /** The calendar's event labels by ID; a label supersedes `colorId`. */
  readonly labels: HashMap.HashMap<string, EventColor>
  /** The calendar's own colour, which Google shows for events without a label or `colorId`. */
  readonly calendarColor: Option.Option<EventColor>
}

const decodeColor = Schema.decodeUnknownOption(EventColor)

/** The calendar's event labels with a usable colour, by label ID. */
export const labelColors = (labels: ReadonlyArray<EventLabel>): HashMap.HashMap<string, EventColor> =>
  HashMap.fromIterable(
    Arr.flatMap(labels, (label) =>
      Arr.fromOption(
        Option.all([
          Option.fromNullishOr(label.id),
          Option.flatMap(Option.fromNullishOr(label.backgroundColor), (color) => decodeColor(Str.toLowerCase(color))),
        ])
      )
    )
  )

// Google resolves an event's colour from its label, then its `colorId`, then the calendar's colour.
const colorOf = (event: Event, palette: CalendarPalette): Option.Option<EventColor> =>
  Option.fromNullishOr(event.eventLabelId).pipe(
    Option.flatMap((labelId) => HashMap.get(palette.labels, labelId)),
    Option.orElse(() =>
      Option.flatMap(Option.fromNullishOr(event.colorId), (colorId) => HashMap.get(CLASSIC_COLORS, colorId))
    ),
    Option.orElse(() => palette.calendarColor)
  )

const text = (value: Option.Option<string>): Option.Option<string> =>
  Option.filter(Option.map(value, Str.trim), (trimmed) => trimmed !== '')

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
const toCalendarEvent = (event: Event, palette: CalendarPalette): Option.Option<CalendarEvent> =>
  Option.flatMap(Option.fromNullishOr(event.id), (id) => {
    const details = {
      id,
      title: Option.fromNullishOr(event.summary).pipe(
        text,
        Option.getOrElse(() => '(No title)')
      ),
      location: Option.fromNullishOr(event.location).pipe(text, Option.getOrNull),
      color: Option.getOrNull(colorOf(event, palette)),
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

/** The RFC 3339 bounds of an events request. */
interface ListWindow {
  readonly timeMin: string
  readonly timeMax: string
}

/** The request window Google Calendar expects for `range`. */
export const listWindow = (range: InstantRange): ListWindow => ({
  timeMin: DateTime.formatIso(range.start),
  timeMax: DateTime.formatIso(range.end),
})

type OccurrencesEffect = Effect.Effect<ReadonlyArray<CalendarEvent>, ReturnType<typeof calendarDecodeError>>

/** How occurrences are placed and coloured. */
export interface OccurrenceContext {
  readonly timezone: IanaTimezone
  readonly palette: CalendarPalette
}

/**
 * Map expanded Google Calendar events to occurrences sorted by start, placing all-day events in the frame timezone
 * and colouring each as Google Calendar does. Cancelled instances are dropped; an event without a usable start and
 * end fails the whole response.
 */
export const toOccurrences: {
  (context: OccurrenceContext): (events: ReadonlyArray<Event>) => OccurrencesEffect
  (events: ReadonlyArray<Event>, context: OccurrenceContext): OccurrencesEffect
} = Function.dual(2, (events: ReadonlyArray<Event>, context: OccurrenceContext): OccurrencesEffect =>
  Effect.forEach(
    Arr.filter(events, (event) => event.status !== 'cancelled'),
    (event) =>
      Effect.fromOption(toCalendarEvent(event, context.palette)).pipe(
        Effect.mapError(() =>
          calendarDecodeError({ message: 'Google Calendar returned an event without a usable time' })
        )
      ),
    { concurrency: 1 }
  ).pipe(Effect.map((occurrences) => Arr.sort(occurrences, byStart(context.timezone))))
)
