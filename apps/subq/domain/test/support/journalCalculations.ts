import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Struct from 'effect/Struct'

import { projectInstantToCalendarDate } from '../../src/Calendar.ts'
import type { IanaTimezone } from '../../src/Calendar.ts'
import { buildGoalProgress } from '../../src/GoalMath.ts'
import type { Goal, InjectionEntry, Schedule, WeightEntry } from '../../src/Journal/JournalRecords.ts'
import { nextDose, scheduleView } from '../../src/ScheduleMath.ts'
import {
  compoundBreakdown,
  dayOfWeekDistribution,
  doseHistory,
  injectionFrequency,
  siteStats,
  weightSummary,
  weightTrend,
} from '../../src/StatsMath.ts'
import { fixtureNow } from './legacyFixture.ts'

export const journalCalculations = ({
  weights,
  injections,
  schedule,
  goal,
  latestWeight,
  timezone,
}: {
  readonly weights: ReadonlyArray<WeightEntry>
  readonly injections: ReadonlyArray<InjectionEntry>
  readonly schedule: Schedule
  readonly goal: Goal
  readonly latestWeight: WeightEntry
  readonly timezone: IanaTimezone
}) => {
  const today = projectInstantToCalendarDate(fixtureNow, timezone)
  const weightHistory = Arr.map(weights, ({ recordedAt, weightLbs }) => ({
    date: DateTime.toDate(recordedAt),
    weightLbs,
  }))
  const input = { entries: injections, timezone }
  return {
    weightSummary: Option.getOrNull(weightSummary({ entries: weights })),
    weightTrend: weightTrend({ entries: weights }),
    sites: siteStats(input),
    doseHistory: doseHistory(input),
    frequency: Option.getOrNull(injectionFrequency(input)),
    compounds: compoundBreakdown(input),
    weekdays: dayOfWeekDistribution(input),
    goalProgress: Struct.omit(
      buildGoalProgress({
        goal,
        currentWeightLbs: latestWeight.weightLbs,
        weightHistory,
        now: DateTime.toDate(fixtureNow),
        timezone,
      }),
      ['goal']
    ),
    nextDose: Option.getOrNull(nextDose({ schedule, injections, today, timezone })),
  }
}

export const journalScheduleProgress = ({
  schedule,
  injections,
  timezone,
}: {
  readonly schedule: Schedule
  readonly injections: ReadonlyArray<InjectionEntry>
  readonly timezone: IanaTimezone
}) => scheduleView(schedule, injections, projectInstantToCalendarDate(fixtureNow, timezone), timezone)
