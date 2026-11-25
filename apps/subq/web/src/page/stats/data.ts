import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { buildGoalProgress } from '@garage/subq-domain/GoalMath'
import type { Goal, InjectionEntry, Schedule, WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import {
  compoundBreakdown,
  dayOfWeekDistribution,
  doseHistory,
  injectionFrequency,
  siteStats,
  weightSummary,
  weightTrend,
} from '@garage/subq-domain/StatsMath'
import type { StatsRange as ZonedRange } from '@garage/subq-domain/StatsMath'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import type * as Types from 'effect/Types'

import type { StatsRange } from './model.ts'

export const calculateStats = ({
  weights,
  injections,
  schedules,
  goal,
  latestWeight,
  selected,
  timezone,
  now,
}: {
  readonly weights: ReadonlyArray<WeightEntry>
  readonly injections: ReadonlyArray<InjectionEntry>
  readonly schedules: ReadonlyArray<Schedule>
  readonly goal: Option.Option<Goal>
  readonly latestWeight: Option.Option<WeightEntry>
  readonly selected: StatsRange
  readonly timezone: IanaTimezone
  readonly now: Date
}) => {
  const range: Types.Mutable<ZonedRange> = { timezone }
  if (Option.isSome(selected.start)) {
    range.startDate = selected.start.value
  }
  if (Option.isSome(selected.end)) {
    range.endDate = selected.end.value
  }
  const weightInput = { entries: weights, range }
  const injectionInput = { entries: injections, range, timezone }
  return {
    weightStats: Option.getOrNull(weightSummary(weightInput)),
    weightTrend: weightTrend(weightInput),
    siteStats: siteStats(injectionInput),
    injections: doseHistory({ entries: injections }).points,
    doseHistory: doseHistory(injectionInput),
    frequency: Option.getOrNull(injectionFrequency(injectionInput)),
    compoundBreakdown: compoundBreakdown(injectionInput),
    dayOfWeek: dayOfWeekDistribution(injectionInput),
    schedules,
    goal: Option.getOrNull(
      Option.map(goal, (goal) =>
        buildGoalProgress({
          goal,
          currentWeightLbs: Option.match(latestWeight, {
            onNone: () => goal.startingWeightLbs,
            onSome: (entry) => entry.weightLbs,
          }),
          weightHistory: Arr.map(weights, ({ recordedAt, weightLbs }) => ({
            date: DateTime.toDate(recordedAt),
            weightLbs,
          })),
          now,
          timezone,
        })
      )
    ),
  }
}

export type StatsBundle = ReturnType<typeof calculateStats>
