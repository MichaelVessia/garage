import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Function from 'effect/Function'
import * as Schema from 'effect/Schema'

import type { DueThresholds, MeterUnit } from './Values.ts'
import { Cadence, IsoDate, MeterReading } from './Values.ts'

export const isoDateFromUtc = (now: DateTime.Utc): IsoDate => IsoDate.make(DateTime.formatIsoDateUtc(now))

const shiftDays = (date: IsoDate, days: number): DateTime.Utc => DateTime.makeUnsafe(date).pipe(DateTime.add({ days }))

export const addDays: {
  (days: number): (date: IsoDate) => IsoDate
  (date: IsoDate, days: number): IsoDate
} = Function.dual(2, (date: IsoDate, days: number): IsoDate => isoDateFromUtc(shiftDays(date, days)))

// A seasonal date in a short month falls on the last day of that month.
const seasonalDateAfter = (after: IsoDate, month: number, day: number): DateTime.Utc => {
  const reference = DateTime.makeUnsafe(after)
  const { year } = DateTime.toPartsUtc(reference)
  const atYear = (targetYear: number): DateTime.Utc => {
    const first = DateTime.makeUnsafe({ year: targetYear, month, day: 1 })
    const last = first.pipe(DateTime.add({ months: 1 }), DateTime.add({ days: -1 }))
    return DateTime.add(first, { days: Math.min(day, DateTime.toPartsUtc(last).day) - 1 })
  }
  const candidate = atYear(year)
  return DateTime.isGreaterThan(candidate, reference) ? candidate : atYear(year + 1)
}

export const nextSeasonalDate: {
  (month: number, day: number): (after: IsoDate) => IsoDate
  (after: IsoDate, month: number, day: number): IsoDate
} = Function.dual(3, (after: IsoDate, month: number, day: number): IsoDate =>
  isoDateFromUtc(seasonalDateAfter(after, month, day))
)

// Dates outside the four-digit calendar have no representable due threshold.
const dateDue = (date: DateTime.Utc): DueThresholds => {
  if (!Number.isFinite(DateTime.toEpochMillis(date))) {
    return {}
  }
  const nextDueOn = DateTime.formatIsoDateUtc(date)
  return Schema.is(IsoDate)(nextDueOn) ? { nextDueOn } : {}
}

export const computeNextDue: {
  (referenceDate: IsoDate, referenceMeter?: number): (cadence: Cadence) => DueThresholds
  (cadence: Cadence, referenceDate: IsoDate, referenceMeter?: number): DueThresholds
} = Function.dual(
  (args) => typeof args[0] === 'object',
  (cadence: Cadence, referenceDate: IsoDate, referenceMeter?: number): DueThresholds => {
    const meterDue = (every: number): DueThresholds => {
      if (referenceMeter === undefined) {
        return {}
      }
      const nextDueMeter = referenceMeter + every
      return Schema.is(MeterReading)(nextDueMeter) ? { nextDueMeter } : {}
    }

    return Cadence.match(cadence, {
      IntervalDays: ({ days }) => dateDue(shiftDays(referenceDate, days)),
      MeterInterval: ({ every }) => meterDue(every),
      Either: ({ days, every }) => ({ ...dateDue(shiftDays(referenceDate, days)), ...meterDue(every) }),
      Seasonal: ({ month, day }) => dateDue(seasonalDateAfter(referenceDate, month, day)),
    })
  }
)

const meterWindows: Readonly<Record<typeof MeterUnit.Type, number>> = { miles: 500, hours: 25 }

export const defaultWithinMeter = (unit?: typeof MeterUnit.Type): number =>
  unit === undefined ? 0 : meterWindows[unit]

type DueStatusInput = DueThresholds & {
  readonly nowDate: IsoDate
  readonly currentMeter?: number
  readonly withinDays: number
  readonly withinMeter: number
}

export const computeDueStatus = ({
  nextDueOn,
  nextDueMeter,
  nowDate,
  currentMeter,
  withinDays,
  withinMeter,
}: DueStatusInput): 'ok' | 'due_soon' | 'overdue' => {
  const meterRemaining =
    nextDueMeter === undefined || currentMeter === undefined ? Infinity : nextDueMeter - currentMeter
  if ((nextDueOn !== undefined && nextDueOn < nowDate) || meterRemaining < 0) {
    return 'overdue'
  }
  const dueByDate =
    nextDueOn !== undefined &&
    DateTime.distance(DateTime.makeUnsafe(nowDate), DateTime.makeUnsafe(nextDueOn)).pipe(Duration.toDays) <= withinDays
  if (dueByDate || (meterRemaining !== Infinity && meterRemaining <= withinMeter)) {
    return 'due_soon'
  }
  return 'ok'
}
