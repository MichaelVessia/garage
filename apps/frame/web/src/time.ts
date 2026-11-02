import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

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
export const localHour = (instant: DateTime.DateTime, timezone: IanaTimezone): number =>
  DateTime.getPart(zoned(instant, timezone), 'hour')

/** "4:05" and "PM" for a local clock face. */
export const clockParts = (instant: DateTime.DateTime, timezone: IanaTimezone) => {
  const local = zoned(instant, timezone)
  const hour = DateTime.getPart(local, 'hour')
  const minute = DateTime.getPart(local, 'minute')
  return {
    time: `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')}`,
    meridiem: hour >= 12 ? 'PM' : 'AM',
  }
}

/** "4:05 PM". */
export const formatTime = (instant: DateTime.DateTime, timezone: IanaTimezone): string => {
  const { time, meridiem } = clockParts(instant, timezone)
  return `${time} ${meridiem}`
}

const dateParts = (date: CalendarDate) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
})

/** "Monday". */
export const weekdayName = (date: CalendarDate): string => DAYS[calendarDayOfWeek(date)] ?? ''

/** "Mon". */
export const weekdayShort = (date: CalendarDate): string => weekdayName(date).slice(0, 3)

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
export const today = (now: DateTime.DateTime, timezone: IanaTimezone): CalendarDate => calendarDateOf(now, timezone)

/** Whether the event is an all-day occurrence. */
export const isAllDay = Schema.is(AllDayEvent)

/** Whether the event is a timed occurrence. */
export const isTimed = Schema.is(TimedEvent)

/** Whether the event occupies any part of the local date. */
export const occursOn = (event: CalendarEvent, date: CalendarDate, timezone: IanaTimezone): boolean => {
  if (isAllDay(event)) {
    return event.startDate <= date && date < event.endDate
  }
  const dayStart = calendarDateStartUtc(date, timezone)
  const dayEnd = calendarDateStartUtc(addCalendarDays(date, 1), timezone)
  return DateTime.isLessThan(event.start, dayEnd) && DateTime.isGreaterThan(event.end, dayStart)
}

/** Whether a timed event is happening at `now`. */
export const isHappening = (event: CalendarEvent, now: DateTime.DateTime): boolean =>
  isTimed(event) && DateTime.isLessThanOrEqualTo(event.start, now) && DateTime.isGreaterThan(event.end, now)

/** Whether a timed event has finished by `now`. */
export const hasEnded = (event: CalendarEvent, now: DateTime.DateTime): boolean =>
  isTimed(event) && DateTime.isLessThanOrEqualTo(event.end, now)
