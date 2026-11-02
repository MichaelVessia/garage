import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

const isRealCalendarDate = Schema.makeFilter(
  (value: string) =>
    CALENDAR_DATE_PATTERN.test(value) &&
    Option.exists(DateTime.make(value), (date) => DateTime.formatIsoDateUtc(date) === value),
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

/** Project an instant onto its calendar date in a timezone. */
export const calendarDateOf = (instant: DateTime.DateTime, timezone: IanaTimezone): CalendarDate =>
  CalendarDate.make(DateTime.setZoneNamedUnsafe(instant, timezone).pipe(DateTime.formatIsoDate))

/** Resolve the first instant of a calendar date in a timezone. */
export const calendarDateStartUtc = (date: CalendarDate, timezone: IanaTimezone): DateTime.Utc =>
  DateTime.makeZonedUnsafe(calendarDateParts(date), {
    adjustForTimeZone: true,
    timeZone: timezone,
  }).pipe(DateTime.toUtc)

/** Day of week for a calendar date, 0 = Sunday. */
export const calendarDayOfWeek = (date: CalendarDate): number =>
  DateTime.getPartUtc(DateTime.makeUnsafe(calendarDateParts(date)), 'weekDay')
