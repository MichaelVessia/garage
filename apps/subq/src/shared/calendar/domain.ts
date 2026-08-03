import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const DATE_TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u

const isRealCalendarDate = Schema.makeFilter(
  (value: string) => {
    if (!CALENDAR_DATE_PATTERN.test(value)) {
      return false
    }
    return Option.exists(DateTime.make(value), (date) => DateTime.formatIsoDateUtc(date) === value)
  },
  {
    description: 'A real Gregorian calendar date in YYYY-MM-DD format',
    expected: 'a real calendar date in YYYY-MM-DD format',
    identifier: 'CalendarDateCheck',
    title: 'Calendar date check',
  }
)

const isNamedTimezone = Schema.makeFilter(
  (value: string) => !/^[+-]/u.test(value) && Option.isSome(DateTime.zoneMakeNamed(value)),
  {
    description: 'A runtime-supported IANA named timezone identifier',
    expected: 'an IANA named timezone',
    identifier: 'IanaTimezoneCheck',
    title: 'IANA timezone check',
  }
)

/** A date on the Gregorian calendar with no time or timezone. */
export const CalendarDate = Schema.String.check(isRealCalendarDate).pipe(Schema.brand('CalendarDate'))
/** A date on the Gregorian calendar with no time or timezone. */
export type CalendarDate = typeof CalendarDate.Type

/** A runtime-supported IANA named timezone identifier. */
export const IanaTimezone = Schema.String.check(isNamedTimezone).pipe(Schema.brand('IanaTimezone'))
/** A runtime-supported IANA named timezone identifier. */
export type IanaTimezone = typeof IanaTimezone.Type

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

const calendarDateParts = (date: CalendarDate): Partial<DateTime.DateTime.Parts> => ({
  day: Number(date.slice(8, 10)),
  month: Number(date.slice(5, 7)),
  year: Number(date.slice(0, 4)),
})

/** Add whole Gregorian calendar days to a date-only value. */
export const addCalendarDays = (date: CalendarDate, days: number): CalendarDate =>
  CalendarDate.make(
    DateTime.makeUnsafe(calendarDateParts(date)).pipe(DateTime.add({ days }), DateTime.formatIsoDateUtc)
  )

/** Add whole Gregorian calendar months to a date-only value. */
export const addCalendarMonths = (date: CalendarDate, months: number): CalendarDate =>
  CalendarDate.make(
    DateTime.makeUnsafe(calendarDateParts(date)).pipe(DateTime.add({ months }), DateTime.formatIsoDateUtc)
  )

/** Return the signed number of whole calendar days from `start` to `end`. */
export const calendarDaysBetween = (start: CalendarDate, end: CalendarDate): number =>
  (DateTime.toEpochMillis(DateTime.makeUnsafe(calendarDateParts(end))) -
    DateTime.toEpochMillis(DateTime.makeUnsafe(calendarDateParts(start)))) /
  (24 * 60 * 60 * 1000)

/** Project a UTC instant onto its calendar date in a persisted timezone. */
export const projectInstantToCalendarDate = (instant: DateTime.Utc, timezone: IanaTimezone): CalendarDate =>
  CalendarDate.make(DateTime.setZoneNamedUnsafe(instant, timezone).pipe(DateTime.formatIsoDate))

/** Resolve the first instant of a calendar date in a persisted timezone. */
export const calendarDateStartUtc = (date: CalendarDate, timezone: IanaTimezone): DateTime.Utc =>
  DateTime.makeZonedUnsafe(calendarDateParts(date), {
    adjustForTimeZone: true,
    timeZone: timezone,
  }).pipe(DateTime.toUtc)

/** Parse a `datetime-local` control value as wall time in a persisted timezone. */
export const parseDateTimeInputInTimezone = (value: string, timezone: IanaTimezone): Option.Option<DateTime.Utc> => {
  const match = DATE_TIME_INPUT_PATTERN.exec(value)
  if (match === null) {
    return Option.none()
  }
  const [, year, month, day, hours, minutes] = match
  if (year === undefined || month === undefined || day === undefined || hours === undefined || minutes === undefined) {
    return Option.none()
  }
  const calendarDate = `${year}-${month}-${day}`
  const hour = Number(hours)
  const minute = Number(minutes)
  if (!Schema.is(CalendarDate)(calendarDate) || hour > 23 || minute > 59) {
    return Option.none()
  }
  return DateTime.makeZoned(
    {
      ...calendarDateParts(calendarDate),
      hour,
      minute,
    },
    {
      adjustForTimeZone: true,
      disambiguation: 'reject',
      timeZone: timezone,
    }
  ).pipe(Option.map(DateTime.toUtc))
}

/** Format a UTC instant for a `datetime-local` control in a persisted timezone. */
export const formatInstantForDateTimeInput = (instant: DateTime.Utc, timezone: IanaTimezone): string => {
  const parts = DateTime.setZoneNamedUnsafe(instant, timezone).pipe(DateTime.toParts)
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}
