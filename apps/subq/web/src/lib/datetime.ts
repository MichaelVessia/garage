import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import type * as Option from 'effect/Option'

import { formatInstantForDateTimeInput, parseDateTimeInputInTimezone, projectInstantToCalendarDate } from '#shared'
import type { CalendarDate, IanaTimezone } from '#shared'

/** Parse a `datetime-local` value in the persisted user timezone. */
export const fromLocalDatetimeString: {
  (timezone: IanaTimezone): (value: string) => Option.Option<DateTime.Utc>
  (value: string, timezone: IanaTimezone): Option.Option<DateTime.Utc>
} = Function.dual(2, (value: string, timezone: IanaTimezone): Option.Option<DateTime.Utc> =>
  parseDateTimeInputInTimezone(value, timezone)
)

/** Format an instant for a `datetime-local` control in the persisted user timezone. */
export const utcToLocalDatetimeString: {
  (timezone: IanaTimezone): (instant: DateTime.Utc) => string
  (instant: DateTime.Utc, timezone: IanaTimezone): string
} = Function.dual(2, (instant: DateTime.Utc, timezone: IanaTimezone): string =>
  formatInstantForDateTimeInput(instant, timezone)
)

/** Project an instant onto a date in the persisted user timezone. */
export const utcToLocalDateString: {
  (timezone: IanaTimezone): (instant: DateTime.Utc) => CalendarDate
  (instant: DateTime.Utc, timezone: IanaTimezone): CalendarDate
} = Function.dual(2, (instant: DateTime.Utc, timezone: IanaTimezone): CalendarDate =>
  projectInstantToCalendarDate(instant, timezone)
)

/** Convert epoch milliseconds to a JavaScript Date for instant-based charts. */
export const epochToDate = (milliseconds: number): Date => DateTime.toDate(DateTime.makeUnsafe(milliseconds))

/** Convert a JavaScript Date instant to a calendar date in the persisted timezone. */
export const dateToCalendarDate: {
  (timezone: IanaTimezone): (date: Date) => CalendarDate
  (date: Date, timezone: IanaTimezone): CalendarDate
} = Function.dual(2, (date: Date, timezone: IanaTimezone): CalendarDate =>
  projectInstantToCalendarDate(DateTime.makeUnsafe(date), timezone)
)

/** Convert a calendar date to UTC midnight for date-only chart coordinates. */
export const calendarDateToDate = (date: CalendarDate): Date => DateTime.toDate(DateTime.makeUnsafe(date))

/** Format an instant with time-of-day in the persisted user timezone. */
export const formatDateTime: {
  (timezone: IanaTimezone): (instant: DateTime.Utc) => string
  (instant: DateTime.Utc, timezone: IanaTimezone): string
} = Function.dual(2, (instant: DateTime.Utc, timezone: IanaTimezone): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(DateTime.toDate(instant))
)

/** Format a date-only value identically regardless of the browser timezone. */
export const formatDate = (date: CalendarDate): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(calendarDateToDate(date))

/** Format a short date-only value identically regardless of the browser timezone. */
export const formatShortDate = (date: CalendarDate): string =>
  new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(calendarDateToDate(date))
