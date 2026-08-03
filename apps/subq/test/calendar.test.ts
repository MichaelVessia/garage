import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  CalendarDate,
  IanaTimezone,
  addCalendarDays,
  calendarDateStartUtc,
  calendarDaysBetween,
  formatInstantForDateTimeInput,
  parseDateTimeInputInTimezone,
  projectInstantToCalendarDate,
} from '#shared'

const decodeCalendarDate = Schema.decodeUnknownExit(CalendarDate)
const decodeTimezone = Schema.decodeUnknownExit(IanaTimezone)

const timezone = IanaTimezone.make('America/New_York')

describe('calendar temporal model', () => {
  it('accepts real ISO calendar dates and rejects normalized or timestamp values', () => {
    assert.isTrue(Exit.isSuccess(decodeCalendarDate('2024-02-29')))
    assert.isTrue(Exit.isFailure(decodeCalendarDate('2023-02-29')))
    assert.isTrue(Exit.isFailure(decodeCalendarDate('2024-02-30')))
    assert.isTrue(Exit.isFailure(decodeCalendarDate('2024-02-29T00:00:00Z')))
  })

  it('accepts named IANA timezones and rejects offsets or unknown names', () => {
    assert.isTrue(Exit.isSuccess(decodeTimezone('America/New_York')))
    assert.isTrue(Exit.isSuccess(decodeTimezone('Pacific/Auckland')))
    assert.isTrue(Exit.isSuccess(decodeTimezone('GMT')))
    assert.isTrue(Exit.isFailure(decodeTimezone('-05:00')))
    assert.isTrue(Exit.isFailure(decodeTimezone('Not/A_Zone')))
  })

  it('projects one UTC instant onto different positive and negative offset calendar dates', () => {
    const instant = DateTime.makeUnsafe('2026-01-01T02:00:00Z')

    assert.strictEqual(projectInstantToCalendarDate(instant, timezone), '2025-12-31')
    assert.strictEqual(projectInstantToCalendarDate(instant, IanaTimezone.make('Pacific/Auckland')), '2026-01-01')
  })

  it('uses calendar arithmetic rather than elapsed local-day milliseconds', () => {
    const leapDay = CalendarDate.make('2024-02-29')
    const afterDst = CalendarDate.make('2026-03-09')

    assert.strictEqual(addCalendarDays(leapDay, 1), '2024-03-01')
    assert.strictEqual(calendarDaysBetween(CalendarDate.make('2026-03-07'), afterDst), 2)
  })

  it('creates local-day boundaries with daylight-saving offsets', () => {
    const springStart = calendarDateStartUtc(CalendarDate.make('2026-03-08'), timezone)
    const springEnd = calendarDateStartUtc(CalendarDate.make('2026-03-09'), timezone)
    const fallStart = calendarDateStartUtc(CalendarDate.make('2026-11-01'), timezone)
    const fallEnd = calendarDateStartUtc(CalendarDate.make('2026-11-02'), timezone)

    assert.strictEqual(DateTime.formatIso(springStart), '2026-03-08T05:00:00.000Z')
    assert.strictEqual(DateTime.formatIso(springEnd), '2026-03-09T04:00:00.000Z')
    assert.strictEqual(DateTime.toEpochMillis(springEnd) - DateTime.toEpochMillis(springStart), 23 * 60 * 60 * 1000)
    assert.strictEqual(DateTime.formatIso(fallStart), '2026-11-01T04:00:00.000Z')
    assert.strictEqual(DateTime.formatIso(fallEnd), '2026-11-02T05:00:00.000Z')
    assert.strictEqual(DateTime.toEpochMillis(fallEnd) - DateTime.toEpochMillis(fallStart), 25 * 60 * 60 * 1000)
  })

  it('round-trips ordinary local datetime inputs and rejects DST gaps', () => {
    const parsed = parseDateTimeInputInTimezone('2026-07-04T09:30', timezone)

    assert.isTrue(Option.isSome(parsed))
    if (Option.isSome(parsed)) {
      assert.strictEqual(DateTime.formatIso(parsed.value), '2026-07-04T13:30:00.000Z')
      assert.strictEqual(formatInstantForDateTimeInput(parsed.value, timezone), '2026-07-04T09:30')
    }
    assert.isTrue(Option.isNone(parseDateTimeInputInTimezone('2026-03-08T02:30', timezone)))
    assert.isTrue(Option.isNone(parseDateTimeInputInTimezone('2026-11-01T01:30', timezone)))
    assert.isTrue(Option.isNone(parseDateTimeInputInTimezone('2026-07-04T24:00', timezone)))
    assert.isTrue(Option.isNone(parseDateTimeInputInTimezone('2026-07-04T23:60', timezone)))
  })
})
