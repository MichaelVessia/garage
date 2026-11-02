import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

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
  day: Number(Str.slice(8, 10)(date)),
  month: Number(Str.slice(5, 7)(date)),
  year: Number(Str.slice(0, 4)(date)),
})

/** Add whole Gregorian calendar days to a date-only value. */
export const addCalendarDays: {
  (days: number): (date: CalendarDate) => CalendarDate
  (date: CalendarDate, days: number): CalendarDate
} = Function.dual(2, (date: CalendarDate, days: number): CalendarDate =>
  CalendarDate.make(
    DateTime.makeUnsafe(calendarDateParts(date)).pipe(DateTime.add({ days }), DateTime.formatIsoDateUtc)
  )
)

/** Project an instant onto its calendar date in a timezone. */
export const calendarDateOf: {
  (timezone: IanaTimezone): (instant: DateTime.DateTime) => CalendarDate
  (instant: DateTime.DateTime, timezone: IanaTimezone): CalendarDate
} = Function.dual(2, (instant: DateTime.DateTime, timezone: IanaTimezone): CalendarDate =>
  CalendarDate.make(DateTime.setZoneNamedUnsafe(instant, timezone).pipe(DateTime.formatIsoDate))
)

/** Resolve the first instant of a calendar date in a timezone. */
export const calendarDateStartUtc: {
  (timezone: IanaTimezone): (date: CalendarDate) => DateTime.Utc
  (date: CalendarDate, timezone: IanaTimezone): DateTime.Utc
} = Function.dual(2, (date: CalendarDate, timezone: IanaTimezone): DateTime.Utc =>
  DateTime.makeZonedUnsafe(calendarDateParts(date), {
    adjustForTimeZone: true,
    timeZone: timezone,
  }).pipe(DateTime.toUtc)
)

/** Day of week for a calendar date, 0 = Sunday. */
export const calendarDayOfWeek = (date: CalendarDate): number =>
  DateTime.getPartUtc(DateTime.makeUnsafe(calendarDateParts(date)), 'weekDay')
