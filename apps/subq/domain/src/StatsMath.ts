import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

import { addCalendarDays, calendarDateStartUtc } from './Calendar.ts'
import type { CalendarDate, IanaTimezone } from './Calendar.ts'
import type { InjectionEntry, WeightEntry } from './Journal/JournalRecords.ts'
import {
  Count,
  DayOfWeek,
  DaysBetween,
  InjectionSite,
  InjectionsPerWeek,
  WeightLbs,
  WeightRateOfChange,
} from './Values.ts'
import { calculateWeightTrajectory } from './WeightMath.ts'

export interface StatsRange {
  readonly startDate?: CalendarDate
  readonly endDate?: CalendarDate
  readonly timezone: IanaTimezone
}

const inRange = <Entry>(
  entries: ReadonlyArray<Entry>,
  time: (entry: Entry) => DateTime.Utc,
  range?: StatsRange
): ReadonlyArray<Entry> => {
  if (range === undefined || (range.startDate === undefined && range.endDate === undefined)) {
    return entries
  }
  const start = range.startDate === undefined ? undefined : calendarDateStartUtc(range.startDate, range.timezone)
  const end =
    range.endDate === undefined ? undefined : calendarDateStartUtc(addCalendarDays(range.endDate, 1), range.timezone)
  return Arr.filter(entries, (entry) => {
    const instant = time(entry)
    return (
      (start === undefined || DateTime.Order(instant, start) >= 0) &&
      (end === undefined || DateTime.Order(instant, end) < 0)
    )
  })
}

const weightPoints = (entries: ReadonlyArray<WeightEntry>, range?: StatsRange) =>
  Arr.map(
    Arr.sortWith(
      inRange(entries, (entry) => entry.recordedAt, range),
      (entry) => entry.recordedAt,
      DateTime.Order
    ),
    ({ recordedAt, weightLbs }) => ({ date: DateTime.toDate(recordedAt), weightLbs })
  )

const injectionEntries = (entries: ReadonlyArray<InjectionEntry>, range?: StatsRange) =>
  inRange(entries, (entry) => entry.administeredAt, range)

const injectionDates = (entries: ReadonlyArray<InjectionEntry>, range?: StatsRange) =>
  Arr.map(injectionEntries(entries, range), ({ administeredAt }) => DateTime.toDate(administeredAt))

export const weightSummary = ({
  entries,
  range,
}: {
  readonly entries: ReadonlyArray<WeightEntry>
  readonly range?: StatsRange
}) => {
  const points = weightPoints(entries, range)
  const first = points[0]
  if (first === undefined) {
    return Option.none()
  }
  const totals = Arr.reduce(
    points,
    { min: Number(first.weightLbs), max: Number(first.weightLbs), sum: 0, correction: 0 },
    (totals, { weightLbs }) => {
      const sum = totals.sum + weightLbs
      const correction = Math.abs(totals.sum) >= weightLbs ? totals.sum - sum + weightLbs : weightLbs - sum + totals.sum
      return {
        min: Math.min(totals.min, weightLbs),
        max: Math.max(totals.max, weightLbs),
        sum,
        correction: totals.correction + correction,
      }
    }
  )
  return Option.some({
    minWeightLbs: WeightLbs.make(totals.min),
    maxWeightLbs: WeightLbs.make(totals.max),
    avgWeightLbs: WeightLbs.make((totals.sum + totals.correction) / points.length),
    rateOfChange: WeightRateOfChange.make(calculateWeightTrajectory(points).rateOfChange),
    entryCount: Count.make(points.length),
  })
}

export const weightTrend = ({
  entries,
  range,
}: {
  readonly entries: ReadonlyArray<WeightEntry>
  readonly range?: StatsRange
}) => {
  const points = weightPoints(entries, range)
  return { points, trendLine: Option.getOrNull(calculateWeightTrajectory(points).trendLine) }
}

const countBy = <Key>(
  entries: ReadonlyArray<InjectionEntry>,
  keyOf: (entry: InjectionEntry) => Key,
  compareKeys: Order.Order<Key>
) => {
  const counts = MutableHashMap.empty<Key, number>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const previous = Option.getOrElse(MutableHashMap.get(counts, key), () => 0)
    MutableHashMap.set(counts, key, previous + 1)
  }
  const byCountAndKey: Order.Order<readonly [Key, number]> = ([left, leftCount], [right, rightCount]) =>
    Order.Number(rightCount, leftCount) || compareKeys(left, right)
  return Arr.sort(counts, byCountAndKey)
}

// Grouped ties follow the legacy SQLite query order. Null sites sort last.
const siteOrder: Order.Order<InjectionEntry['site']> = (left, right) => {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return 1
  }
  return right === null ? -1 : Order.String(right, left)
}

interface InjectionStatsInput {
  readonly entries: ReadonlyArray<InjectionEntry>
  readonly range?: StatsRange
}

export const siteStats = ({ entries, range }: InjectionStatsInput) => {
  const selected = injectionEntries(entries, range)
  return {
    sites: Arr.map(
      countBy(selected, (entry) => entry.site, siteOrder),
      ([site, count]) => ({
        site: site ?? InjectionSite.make('Unknown'),
        count: Count.make(count),
      })
    ),
    totalInjections: Count.make(selected.length),
  }
}

export const doseHistory = ({ entries, range }: InjectionStatsInput) => ({
  points: Arr.map(
    Arr.sortWith(injectionEntries(entries, range), (entry) => entry.administeredAt, DateTime.Order),
    ({ administeredAt, compound, doseMg }) => ({ date: DateTime.toDate(administeredAt), compound, doseMg })
  ),
})

export const compoundBreakdown = ({ entries, range }: InjectionStatsInput) => {
  const selected = injectionEntries(entries, range)
  return {
    compounds: Arr.map(
      countBy(
        selected,
        (entry) => entry.compound,
        (left, right) => Order.String(right, left)
      ),
      ([compound, count]) => ({
        compound,
        count: Count.make(count),
      })
    ),
    totalInjections: Count.make(selected.length),
  }
}

const MS_PER_DAY = 86_400_000
const MS_PER_WEEK = 7 * MS_PER_DAY
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const countDaysOfWeek = (dates: ReadonlyArray<Date>, timezone: IanaTimezone) => {
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone })
  const names = Arr.map(dates, (date) => formatter.format(date))
  return Arr.map(DAY_NAMES, (day) => Arr.filter(names, (name) => name === day).length)
}

interface ZonedInjectionStatsInput extends InjectionStatsInput {
  readonly timezone: IanaTimezone
}

export const dayOfWeekDistribution = ({ entries, range, timezone }: ZonedInjectionStatsInput) => {
  const dates = injectionDates(entries, range)
  const counts = countDaysOfWeek(dates, timezone)
  return {
    days: Arr.flatMap(counts, (count, day) =>
      count === 0 ? [] : [{ dayOfWeek: DayOfWeek.make(day), count: Count.make(count) }]
    ),
    totalInjections: Count.make(dates.length),
  }
}

export const injectionFrequency = ({ entries, range, timezone }: ZonedInjectionStatsInput) => {
  const dates = Arr.sortWith(injectionDates(entries, range), (date) => date.getTime(), Order.Number)
  if (!Arr.isReadonlyArrayNonEmpty(dates)) {
    return Option.none()
  }
  const first = Arr.headNonEmpty(dates)
  const last = Arr.lastNonEmpty(dates)
  const gaps = Arr.zipWith(
    dates,
    Arr.drop(dates, 1),
    (previous, next) => (next.getTime() - previous.getTime()) / MS_PER_DAY
  )
  const totalGapDays = Arr.reduce(gaps, 0, (sum, gap) => sum + gap)
  const periodWeeks = (last.getTime() - first.getTime()) / MS_PER_WEEK
  const dayCounts = countDaysOfWeek(dates, timezone)
  const mostFrequentDay = Arr.reduce(dayCounts, { day: 0, count: 0 }, (best, count, day) =>
    count > best.count ? { day, count } : best
  )
  return Option.some({
    totalInjections: Count.make(dates.length),
    avgDaysBetween: DaysBetween.make(gaps.length > 0 ? totalGapDays / gaps.length : 0),
    mostFrequentDayOfWeek: DayOfWeek.make(mostFrequentDay.day),
    injectionsPerWeek: InjectionsPerWeek.make(periodWeeks > 0 ? dates.length / periodWeeks : dates.length),
  })
}
