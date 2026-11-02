import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

import type { IanaTimezone } from '../calendar/domain.js'
import { Count, DayOfWeek, DaysBetween } from '../common/domain.js'
import { InjectionsPerWeek } from '../injection/domain.js'
import { DayOfWeekCount, InjectionDayOfWeekStats, InjectionFrequencyStats } from './domain.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const getDayOfWeekInTimezone: {
  (timezone: IanaTimezone): (date: Date) => number
  (date: Date, timezone: IanaTimezone): number
} = Function.dual(2, (date: Date, timezone: IanaTimezone): number => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  }).format(date)

  const dayIndex = Arr.findFirstIndex(DAY_NAMES, (dayName) => dayName === weekday)

  return Option.getOrElse(dayIndex, () => 0)
})

/** Count of injections for each day of the week, indexed 0 (Sunday) through 6 (Saturday). */
const countDaysOfWeek = (dates: ReadonlyArray<Date>, timezone: IanaTimezone): ReadonlyArray<number> => {
  const daysOfWeek = Arr.map(dates, (date) => getDayOfWeekInTimezone(date, timezone))

  return Arr.map(Arr.range(0, DAY_NAMES.length - 1), (day) => Arr.filter(daysOfWeek, (d) => d === day).length)
}

interface MostFrequentDay {
  readonly day: Option.Option<number>
  readonly count: number
}

const mostFrequentDayOfWeek = (dayCounts: ReadonlyArray<number>): Option.Option<number> => {
  const initial: MostFrequentDay = { day: Option.none(), count: 0 }

  const best = Arr.reduce(dayCounts, initial, (candidate, count, day) =>
    count > candidate.count ? { day: Option.some(day), count } : candidate
  )

  return best.day
}

export const buildInjectionDayOfWeekStats: {
  (timezone: IanaTimezone): (dates: ReadonlyArray<Date>) => InjectionDayOfWeekStats
  (dates: ReadonlyArray<Date>, timezone: IanaTimezone): InjectionDayOfWeekStats
} = Function.dual(2, (dates: ReadonlyArray<Date>, timezone: IanaTimezone): InjectionDayOfWeekStats => {
  const dayCounts = countDaysOfWeek(dates, timezone)

  const days = Arr.flatMap(dayCounts, (count, day) =>
    count > 0 ? [DayOfWeekCount.make({ dayOfWeek: DayOfWeek.make(day), count: Count.make(count) })] : []
  )

  return InjectionDayOfWeekStats.make({ days, totalInjections: Count.make(dates.length) })
})

export const buildObservedInjectionFrequency: {
  (timezone: IanaTimezone): (dates: ReadonlyArray<Date>) => Option.Option<InjectionFrequencyStats>
  (dates: ReadonlyArray<Date>, timezone: IanaTimezone): Option.Option<InjectionFrequencyStats>
} = Function.dual(2, (dates: ReadonlyArray<Date>, timezone: IanaTimezone): Option.Option<InjectionFrequencyStats> => {
  if (!Arr.isReadonlyArrayNonEmpty(dates)) {
    return Option.none()
  }

  const orderedDates = Arr.sortWith(dates, (date) => date.getTime(), Order.Number)
  const firstDate = Arr.headNonEmpty(orderedDates)
  const lastDate = Arr.lastNonEmpty(orderedDates)

  const laterDates = Arr.drop(orderedDates, 1)

  const gapDays = Arr.zipWith(
    orderedDates,
    laterDates,
    (previous, next) => (next.getTime() - previous.getTime()) / MS_PER_DAY
  )

  const totalGapDays = Arr.reduce(gapDays, 0, (sum, gap) => sum + gap)
  const gapCount = gapDays.length

  const periodWeeks = (lastDate.getTime() - firstDate.getTime()) / MS_PER_WEEK
  const injectionsPerWeek = periodWeeks > 0 ? orderedDates.length / periodWeeks : orderedDates.length
  const dayCounts = countDaysOfWeek(orderedDates, timezone)
  const mostFrequentDay = mostFrequentDayOfWeek(dayCounts)

  return Option.some(
    InjectionFrequencyStats.make({
      totalInjections: Count.make(orderedDates.length),
      avgDaysBetween: DaysBetween.make(gapCount > 0 ? totalGapDays / gapCount : 0),
      mostFrequentDayOfWeek: mostFrequentDay.pipe(
        Option.map((day) => DayOfWeek.make(day)),
        Option.getOrNull
      ),
      injectionsPerWeek: InjectionsPerWeek.make(injectionsPerWeek),
    })
  )
})
