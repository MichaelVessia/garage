import { expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'

import {
  addDays,
  computeDueStatus,
  computeNextDue,
  defaultWithinMeter,
  isoDateFromUtc,
  nextSeasonalDate,
} from '../src/ScheduleMath.ts'
import { Cadence, Cents, IsoDate, MeterReading } from '../src/Values.ts'

const date = IsoDate.make

it('parses real Gregorian dates, non-negative cents, and finite non-negative meter readings', () => {
  expect(Schema.is(IsoDate)('2024-02-29')).toBe(true)
  expect(Schema.is(IsoDate)('2025-02-29')).toBe(false)
  expect(Schema.is(IsoDate)('2025-2-01')).toBe(false)
  expect(Schema.is(IsoDate)('2025-13-01')).toBe(false)
  expect(Schema.is(Cents)(0)).toBe(true)
  expect(Schema.is(Cents)(-1)).toBe(false)
  expect(Schema.is(Cents)(1.5)).toBe(false)
  expect(Schema.is(MeterReading)(1.5)).toBe(true)
  expect(Schema.is(MeterReading)(-1)).toBe(false)
  expect(Schema.is(MeterReading)(Infinity)).toBe(false)
})

it('adds UTC calendar days across a leap day', () => {
  expect(isoDateFromUtc(DateTime.makeUnsafe('2024-02-28T23:55:00-02:00'))).toBe('2024-02-29')
  expect(addDays(date('2024-02-28'), 2)).toBe('2024-03-01')
  expect(addDays(2)(date('2024-02-28'))).toBe('2024-03-01')
})

it('moves a seasonal date to the next year after it passes and clamps short months', () => {
  expect(nextSeasonalDate(date('2024-02-28'), 2, 31)).toBe('2024-02-29')
  expect(nextSeasonalDate(2, 29)(date('2024-02-29'))).toBe('2025-02-28')
  expect(nextSeasonalDate(date('2025-12-31'), 1, 1)).toBe('2026-01-01')
})

it('calculates both due thresholds and omits the meter threshold when the reference reading is absent', () => {
  const cadence = Cadence.cases.Either.make({ days: 1, every: 20.5, unit: 'hours' })
  expect(computeNextDue(cadence, date('2025-12-31'), 0)).toEqual({
    nextDueOn: '2026-01-01',
    nextDueMeter: 20.5,
  })
  expect(computeNextDue(date('2025-12-31'))(cadence)).toEqual({ nextDueOn: '2026-01-01' })
})

it('uses meter defaults of 500 miles, 25 hours, and zero for assets without a meter', () => {
  expect(defaultWithinMeter('miles')).toBe(500)
  expect(defaultWithinMeter('hours')).toBe(25)
  expect(defaultWithinMeter(undefined)).toBe(0)
})

it('classifies either threshold with overdue taking priority', () => {
  const input = { nowDate: date('2025-01-02'), currentMeter: 100, withinDays: 7, withinMeter: 10 }
  expect(computeDueStatus(input)).toBe('ok')
  expect(computeDueStatus({ ...input, nextDueOn: date('2025-01-10'), nextDueMeter: 111 })).toBe('ok')
  expect(computeDueStatus({ ...input, nextDueOn: date('2025-01-09') })).toBe('due_soon')
  expect(computeDueStatus({ ...input, nextDueMeter: 110 })).toBe('due_soon')
  expect(computeDueStatus({ ...input, nextDueOn: input.nowDate, nextDueMeter: 100 })).toBe('due_soon')
  expect(computeDueStatus({ ...input, nextDueOn: date('2025-01-01'), nextDueMeter: 105 })).toBe('overdue')
  expect(computeDueStatus({ ...input, nextDueOn: date('2025-01-04'), nextDueMeter: 99 })).toBe('overdue')
})

it('keeps representable thresholds when a date or meter interval exceeds its range', () => {
  const oversized = Cadence.cases.IntervalDays.make({ days: Number.MAX_SAFE_INTEGER })
  const annual = Cadence.cases.Seasonal.make({ month: 1, day: 1 })
  const either = Cadence.cases.Either.make({ days: 1, every: 100, unit: 'miles' })
  expect(computeNextDue(oversized, date('2025-01-01'))).toEqual({})
  expect(computeNextDue(annual, date('9999-12-31'))).toEqual({})
  expect(computeNextDue(either, date('9999-12-31'), 10)).toEqual({ nextDueMeter: 110 })
  expect(
    computeDueStatus({
      nowDate: date('9999-12-31'),
      nextDueOn: date('9999-12-31'),
      withinDays: 1,
      withinMeter: 0,
    })
  ).toBe('due_soon')
})
