import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import ICAL from 'ical.js'

import { CalendarDate, calendarDateStartUtc } from '#shared'
import type { AllDayEvent, CalendarEvent, IanaTimezone, TimedEvent } from '#shared'

import { calendarDecodeError } from '../errors.js'

/** An instant range; `end` is exclusive. */
export interface InstantRange {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

interface Occurrence {
  readonly id: string
  readonly item: ICAL.Event
  readonly start: ICAL.Time
  readonly end: ICAL.Time
}

// Upper bound on recurrence iterations per series, so a malformed or unbounded rule cannot stall a request.
const MAX_OCCURRENCES_PER_SERIES = 10_000
// Floating times compare as UTC before zone resolution; a day of slack keeps them inside the range check.
const FLOATING_SLACK_SECONDS = 24 * 60 * 60

const pad = (value: number): string => String(value).padStart(2, '0')

const toCalendarDate = (time: ICAL.Time): CalendarDate =>
  CalendarDate.make(`${time.year}-${pad(time.month)}-${pad(time.day)}`)

const isFloating = (time: ICAL.Time): boolean => time.zone === undefined || time.zone.tzid === 'floating'

const toInstant = (time: ICAL.Time, timezone: IanaTimezone): DateTime.Utc =>
  isFloating(time)
    ? DateTime.makeZonedUnsafe(
        {
          year: time.year,
          month: time.month,
          day: time.day,
          hour: time.hour,
          minute: time.minute,
          second: time.second,
        },
        { adjustForTimeZone: true, timeZone: timezone }
      ).pipe(DateTime.toUtc)
    : DateTime.makeUnsafe(time.toUnixTime() * 1000)

const isCancelled = (event: ICAL.Event): boolean => event.component.getFirstPropertyValue('status') === 'CANCELLED'

// ical.js types SUMMARY and LOCATION as strings, but absent properties read as null.
const textProperty = (value: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (text) => text.trim() !== '')

const occurrencesOf = (event: ICAL.Event, rangeEndSeconds: number): ReadonlyArray<Occurrence> => {
  if (!event.isRecurring()) {
    return [{ id: event.uid, item: event, start: event.startDate, end: event.endDate }]
  }
  const expansion = event.iterator()
  return Arr.unfold(0, (count) => {
    const next = count < MAX_OCCURRENCES_PER_SERIES ? expansion.next() : null
    if (next === null || next === undefined || next.toUnixTime() - FLOATING_SLACK_SECONDS >= rangeEndSeconds) {
      return Option.none()
    }
    const details = event.getOccurrenceDetails(next)
    const occurrence: Occurrence = {
      id: `${event.uid}/${details.recurrenceId.toString()}`,
      item: details.item,
      start: details.startDate,
      end: details.endDate,
    }
    return Option.some([occurrence, count + 1] as const)
  })
}

type EventDetails = Pick<TimedEvent, 'id' | 'title' | 'location' | 'color'>

const toAllDayEvent = (details: EventDetails, occurrence: Occurrence): AllDayEvent => ({
  _tag: 'AllDayEvent',
  ...details,
  startDate: toCalendarDate(occurrence.start),
  endDate: toCalendarDate(occurrence.end),
})

const toTimedEvent = (details: EventDetails, occurrence: Occurrence, timezone: IanaTimezone): TimedEvent => ({
  _tag: 'TimedEvent',
  ...details,
  start: toInstant(occurrence.start, timezone),
  end: toInstant(occurrence.end, timezone),
})

const toCalendarEvent = (occurrence: Occurrence, timezone: IanaTimezone): CalendarEvent => {
  const details: EventDetails = {
    id: occurrence.id,
    title: Option.getOrElse(textProperty(occurrence.item.summary), () => '(No title)'),
    location: Option.getOrNull(textProperty(occurrence.item.location)),
    color: null,
  }
  return occurrence.start.isDate ? toAllDayEvent(details, occurrence) : toTimedEvent(details, occurrence, timezone)
}

const eventBounds = (event: CalendarEvent, timezone: IanaTimezone): InstantRange =>
  Match.valueTags(event, {
    TimedEvent: (timed) => ({ start: timed.start, end: timed.end }),
    AllDayEvent: (allDay) => ({
      start: calendarDateStartUtc(allDay.startDate, timezone),
      end: calendarDateStartUtc(allDay.endDate, timezone),
    }),
  })

const overlaps = (bounds: InstantRange, range: InstantRange): boolean =>
  DateTime.isLessThan(bounds.start, range.end) &&
  (DateTime.isGreaterThan(bounds.end, range.start) ||
    (DateTime.Equivalence(bounds.start, bounds.end) && DateTime.isGreaterThanOrEqualTo(bounds.start, range.start)))

const byStart = (timezone: IanaTimezone): Order.Order<CalendarEvent> =>
  Order.mapInput(DateTime.Order, (event: CalendarEvent) => eventBounds(event, timezone).start)

const uidOf = (component: ICAL.Component): string => String(component.getFirstPropertyValue('uid'))

// ical.js resolves TZID references through its process-wide registry, so feed timezones are registered first.
const parseCalendar = (ics: string): ICAL.Component => {
  const calendar = ICAL.Component.fromString(ics)
  Arr.map(calendar.getAllSubcomponents('vtimezone'), (zone) => {
    ICAL.TimezoneService.register(zone)
  })
  return calendar
}

const seriesEvents = (calendar: ICAL.Component): ReadonlyArray<ICAL.Event> => {
  const components = calendar.getAllSubcomponents('vevent')
  const masterUids = HashSet.fromIterable(
    Arr.map(
      Arr.filter(components, (component) => !component.hasProperty('recurrence-id')),
      uidOf
    )
  )
  // Overrides with a master in the feed are expanded through that master; orphans stand alone.
  return Arr.map(
    Arr.filter(
      components,
      (component) => !(component.hasProperty('recurrence-id') && HashSet.has(masterUids, uidOf(component)))
    ),
    (component) => new ICAL.Event(component)
  )
}

/** Parse an iCalendar feed and expand every occurrence that overlaps `range`, sorted by start. */
export const expandCalendar = (
  ics: string,
  range: InstantRange,
  timezone: IanaTimezone
): Effect.Effect<ReadonlyArray<CalendarEvent>, ReturnType<typeof calendarDecodeError>> =>
  Effect.try({
    try: () => {
      const rangeEndSeconds = DateTime.toEpochMillis(range.end) / 1000
      const events = Arr.flatMap(seriesEvents(parseCalendar(ics)), (event) =>
        Arr.filter(
          Arr.map(
            Arr.filter(occurrencesOf(event, rangeEndSeconds), (occurrence) => !isCancelled(occurrence.item)),
            (occurrence) => toCalendarEvent(occurrence, timezone)
          ),
          (calendarEvent) => overlaps(eventBounds(calendarEvent, timezone), range)
        )
      )
      return Arr.sort(events, byStart(timezone))
    },
    catch: () => calendarDecodeError('The calendar feed is not valid iCalendar data'),
  })
