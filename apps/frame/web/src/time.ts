import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import {
  AllDayEvent,
  TimedEvent,
  addCalendarDays,
  calendarDateOf,
  calendarDateStartUtc,
  calendarDayOfWeek,
} from '#shared'
import type { CalendarDate, CalendarEvent, IanaTimezone } from '#shared'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const zoned = (instant: DateTime.DateTime, timezone: IanaTimezone) => DateTime.setZoneNamedUnsafe(instant, timezone)

/** Hour on the local clock, 0-23. */
export const localHour: {
  (timezone: IanaTimezone): (instant: DateTime.DateTime) => number
  (instant: DateTime.DateTime, timezone: IanaTimezone): number
} = Function.dual(2, (instant: DateTime.DateTime, timezone: IanaTimezone): number =>
  DateTime.getPart(zoned(instant, timezone), 'hour')
)

/** The dark theme covers the evening and night, when the kitchen is lamp-lit: 20:00 to 06:59. */
export const isDarkHour: {
  (timezone: IanaTimezone): (instant: DateTime.DateTime) => boolean
  (instant: DateTime.DateTime, timezone: IanaTimezone): boolean
} = Function.dual(2, (instant: DateTime.DateTime, timezone: IanaTimezone): boolean => {
  const hour = localHour(instant, timezone)

  return hour >= 20 || hour < 7
})

interface ClockParts {
  readonly time: string
  readonly meridiem: string
}

/** "4:05" and "PM" for a local clock face. */
export const clockParts: {
  (timezone: IanaTimezone): (instant: DateTime.DateTime) => ClockParts
  (instant: DateTime.DateTime, timezone: IanaTimezone): ClockParts
} = Function.dual(2, (instant: DateTime.DateTime, timezone: IanaTimezone): ClockParts => {
  const local = zoned(instant, timezone)
  const hour = DateTime.getPart(local, 'hour')
  const minute = DateTime.getPart(local, 'minute')

  return {
    time: `${hour % 12 === 0 ? 12 : hour % 12}:${Str.padStart(2, '0')(String(minute))}`,
    meridiem: hour >= 12 ? 'PM' : 'AM',
  }
})

/** "4:05 PM". */
export const formatTime: {
  (timezone: IanaTimezone): (instant: DateTime.DateTime) => string
  (instant: DateTime.DateTime, timezone: IanaTimezone): string
} = Function.dual(2, (instant: DateTime.DateTime, timezone: IanaTimezone): string => {
  const { time, meridiem } = clockParts(instant, timezone)

  return `${time} ${meridiem}`
})

const dateParts = (date: CalendarDate) => ({
  year: Number(Str.slice(0, 4)(date)),
  month: Number(Str.slice(5, 7)(date)),
  day: Number(Str.slice(8, 10)(date)),
})

/** "Monday". */
export const weekdayName = (date: CalendarDate): string => DAYS[calendarDayOfWeek(date)] ?? ''

/** "Mon". */
export const weekdayShort = (date: CalendarDate): string => Str.slice(0, 3)(weekdayName(date))

/** "November 2". */
export const monthDay = (date: CalendarDate): string => {
  const { month, day } = dateParts(date)

  return `${MONTHS[month - 1] ?? ''} ${day}`
}

/** Day of the month. */
export const dayOfMonth = (date: CalendarDate): number => dateParts(date).day

/** The Sunday that starts the week containing `date`. */
export const weekStart = (date: CalendarDate): CalendarDate => addCalendarDays(date, -calendarDayOfWeek(date))

/** Today's local date. */
export const today: {
  (timezone: IanaTimezone): (now: DateTime.DateTime) => CalendarDate
  (now: DateTime.DateTime, timezone: IanaTimezone): CalendarDate
} = Function.dual(2, (now: DateTime.DateTime, timezone: IanaTimezone): CalendarDate => calendarDateOf(now, timezone))

/** Whether the event is an all-day occurrence. */
export const isAllDay = Schema.is(AllDayEvent)

/** Whether the event is a timed occurrence. */
export const isTimed = Schema.is(TimedEvent)

/** Whether the event occupies any part of the local date. */
export const occursOn: {
  (date: CalendarDate, timezone: IanaTimezone): (event: CalendarEvent) => boolean
  (event: CalendarEvent, date: CalendarDate, timezone: IanaTimezone): boolean
} = Function.dual(3, (event: CalendarEvent, date: CalendarDate, timezone: IanaTimezone): boolean => {
  if (isAllDay(event)) {
    return event.startDate <= date && date < event.endDate
  }

  const dayStart = calendarDateStartUtc(date, timezone)
  const dayEnd = calendarDateStartUtc(addCalendarDays(date, 1), timezone)

  return DateTime.isLessThan(event.start, dayEnd) && DateTime.isGreaterThan(event.end, dayStart)
})

/** Whether a timed event is happening at `now`. */
export const isHappening: {
  (now: DateTime.DateTime): (event: CalendarEvent) => boolean
  (event: CalendarEvent, now: DateTime.DateTime): boolean
} = Function.dual(
  2,
  (event: CalendarEvent, now: DateTime.DateTime): boolean =>
    isTimed(event) && DateTime.isLessThanOrEqualTo(event.start, now) && DateTime.isGreaterThan(event.end, now)
)

/** Whether a timed event has finished by `now`. */
export const hasEnded: {
  (now: DateTime.DateTime): (event: CalendarEvent) => boolean
  (event: CalendarEvent, now: DateTime.DateTime): boolean
} = Function.dual(
  2,
  (event: CalendarEvent, now: DateTime.DateTime): boolean =>
    isTimed(event) && DateTime.isLessThanOrEqualTo(event.end, now)
)
