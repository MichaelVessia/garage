import { assert, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  addCalendarDays,
  CalendarDate,
  calendarDateStartUtc,
  calendarDaysBetween,
  IanaTimezone,
  parseDateTimeInputInTimezone,
  projectInstantToCalendarDate,
} from '../src/Calendar.ts'
import { buildGoalProgress } from '../src/GoalMath.ts'
import { GoalId, InjectionId, ScheduleId, SchedulePhaseId, WeightId } from '../src/Journal/Journal.id.ts'
import type { Goal, InjectionEntry, Schedule, WeightEntry } from '../src/Journal/JournalRecords.ts'
import { getNextSite, SITE_ROTATION } from '../src/MedicationVocabulary.ts'
import {
  currentPhase,
  frequencyToDays,
  inferScheduleDraftFromInjections,
  nextDose,
  scheduleView,
} from '../src/ScheduleMath.ts'
import {
  compoundBreakdown,
  dayOfWeekDistribution,
  doseHistory,
  injectionFrequency,
  siteStats,
  weightSummary,
  weightTrend,
} from '../src/StatsMath.ts'
import { DoseMg, kgToLbs, lbsToKg, PhaseDurationDays, PhaseOrder, ScheduleName, WeightLbs } from '../src/Values.ts'
import { calculateWeightTrajectory, projectWeightTrajectoryDate } from '../src/WeightMath.ts'

const timezone = IanaTimezone.make('America/New_York')
const march10 = CalendarDate.make('2024-03-10')
const march11 = CalendarDate.make('2024-03-11')
const first = DateTime.makeUnsafe('2024-03-10T05:00:00Z')
const second = DateTime.makeUnsafe('2024-03-11T04:00:00Z')
const audit = { createdAt: first, updatedAt: first }
const scheduleId = ScheduleId.make('weekly')
const schedule = {
  ...audit,
  id: scheduleId,
  name: ScheduleName.make('Weekly'),
  startDate: march10,
  isActive: true,
  compound: 'Semaglutide',
  frequency: 'weekly',
  supplier: null,
  notes: null,
  phases: [
    {
      ...audit,
      id: SchedulePhaseId.make('first'),
      durationDays: PhaseDurationDays.make(1),
      order: PhaseOrder.make(1),
      doseMg: DoseMg.make(0.5),
    },
    {
      ...audit,
      id: SchedulePhaseId.make('second'),
      durationDays: null,
      order: PhaseOrder.make(2),
      doseMg: DoseMg.make(1),
    },
  ],
} satisfies Schedule
const assigned = {
  ...audit,
  id: InjectionId.make('assigned'),
  administeredAt: first,
  compound: 'Semaglutide',
  doseMg: DoseMg.make(0.5),
  scheduleId,
  notes: null,
  supplier: null,
  site: null,
} satisfies InjectionEntry
const unassigned = {
  ...assigned,
  id: InjectionId.make('unassigned'),
  administeredAt: second,
  scheduleId: null,
  doseMg: DoseMg.make(1),
}

it('validates dates and time zones and uses local days across daylight saving time', () => {
  expect(Schema.is(CalendarDate)('2024-02-30')).toBe(false)
  expect(Schema.is(IanaTimezone)('+05:00')).toBe(false)
  expect(addCalendarDays(march10, 1)).toBe(march11)
  expect(calendarDateStartUtc(march10, timezone)).toEqual(first)
  expect(calendarDateStartUtc(march11, timezone)).toEqual(second)
  expect(projectInstantToCalendarDate(second, timezone)).toBe(march11)
  expect(parseDateTimeInputInTimezone('2024-03-10T02:30', timezone)).toEqual(Option.none())
  expect(parseDateTimeInputInTimezone('2024-11-03T01:30', timezone)).toEqual(Option.none())
})

it.prop(
  'preserves signed day differences when adding calendar days',
  [Schema.Int.check(Schema.isBetween({ minimum: -800, maximum: 800 }))],
  ([days]) => assert.strictEqual(calendarDaysBetween(march10, addCalendarDays(march10, days)), days)
)

it.prop(
  'converts weight units through pounds',
  [Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 400 }))],
  ([weight]) => assert.closeTo(kgToLbs(lbsToKg(weight)), weight, 1e-10)
)

it('uses the latest same-compound injection for timing and assigned injections for phase progress', () => {
  const different = {
    ...unassigned,
    id: InjectionId.make('different'),
    compound: 'Tirzepatide',
    administeredAt: DateTime.add(second, { days: 1 }),
  } satisfies InjectionEntry
  const entries = [unassigned, different, assigned]
  const dose = nextDose({ schedule, today: march11, injections: entries, timezone })
  expect(Option.getOrNull(dose)).toMatchObject({ suggestedDate: '2024-03-18', currentPhase: 2, daysUntilDue: 7 })
  expect(Option.getOrNull(currentPhase(schedule, march11))?.phase.id).toBe('second')
  const view = scheduleView(schedule, entries, march11, timezone)
  expect(Arr.map(view.phases, ({ completedInjections, status }) => ({ completedInjections, status }))).toEqual([
    { completedInjections: 1, status: 'completed' },
    { completedInjections: 0, status: 'current' },
  ])
  expect(view.endDate).toBeNull()
  expect(frequencyToDays('monthly')).toBe(30)
  expect(Option.getOrNull(inferScheduleDraftFromInjections([assigned, unassigned], timezone))?.phases).toEqual([
    { order: 1, durationDays: Option.some(1), doseMg: 0.5 },
    { order: 2, durationDays: Option.none(), doseMg: 1 },
  ])
})

it('wraps the injection site order', () => {
  expect(getNextSite(Option.none())).toBe(SITE_ROTATION[0])
  expect(getNextSite(Option.some('custom'))).toBe(SITE_ROTATION[0])
  expect(getNextSite(Option.some('Right upper arm'))).toBe(SITE_ROTATION[0])
  expect(getNextSite(Option.some('Left abdomen'))).toBe('Right abdomen')
})

it('computes weight trajectory, projection and goal pace with sparse data', () => {
  const now = DateTime.toDate(second)
  const sameTime = [
    { date: now, weightLbs: 200 },
    { date: now, weightLbs: 199 },
  ]
  expect(calculateWeightTrajectory(sameTime).regression).toEqual(Option.none())
  const history = [
    { date: DateTime.toDate(DateTime.add(second, { days: -7 })), weightLbs: 205 },
    { date: now, weightLbs: 198 },
  ]
  expect(calculateWeightTrajectory(history).rateOfChange).toBe(-7)
  expect(
    projectWeightTrajectoryDate({
      currentWeightLbs: 198,
      targetWeightLbs: 184,
      rateOfChange: -7,
      now,
      maxProjectionDays: 7,
    })
  ).toEqual(Option.none())
  const goal = {
    ...audit,
    id: GoalId.make('goal'),
    goalWeightLbs: WeightLbs.make(184),
    startingWeightLbs: WeightLbs.make(205),
    startingDate: march10,
    targetDate: null,
    notes: null,
    isActive: true,
    completedAt: null,
  } satisfies Goal
  expect(buildGoalProgress({ goal, currentWeightLbs: 198, weightHistory: history, now, timezone })).toMatchObject({
    lbsLost: 7,
    lbsRemaining: 14,
    paceStatus: 'on_track',
    daysOnPlan: 1,
    avgLbsPerWeek: 7,
    projectedDate: '2024-03-25',
  })
  expect(buildGoalProgress({ goal, currentWeightLbs: 198, weightHistory: [], now, timezone }).paceStatus).toBe(
    'not_losing'
  )
})

it('filters statistics through the inclusive local day and preserves empty results', () => {
  const range = { startDate: march10, endDate: march10, timezone }
  const weight = {
    ...audit,
    id: WeightId.make('weight'),
    recordedAt: first,
    weightLbs: WeightLbs.make(200),
    notes: null,
  } satisfies WeightEntry
  const laterWeight = { ...weight, id: WeightId.make('later'), recordedAt: second, weightLbs: WeightLbs.make(199) }
  const injections = { entries: [unassigned, assigned], range, timezone }
  expect(Option.getOrNull(weightSummary({ entries: [laterWeight, weight], range }))).toEqual({
    minWeightLbs: 200,
    maxWeightLbs: 200,
    avgWeightLbs: 200,
    rateOfChange: 0,
    entryCount: 1,
  })
  expect(weightTrend({ entries: [] })).toEqual({ points: [], trendLine: null })
  expect(weightSummary({ entries: [] })).toEqual(Option.none())
  expect(siteStats(injections)).toEqual({ sites: [{ site: 'Unknown', count: 1 }], totalInjections: 1 })
  expect(doseHistory(injections).points).toEqual([
    { date: DateTime.toDate(first), compound: 'Semaglutide', doseMg: 0.5 },
  ])
  expect(compoundBreakdown(injections)).toEqual({
    compounds: [{ compound: 'Semaglutide', count: 1 }],
    totalInjections: 1,
  })
  expect(dayOfWeekDistribution(injections)).toEqual({ days: [{ dayOfWeek: 0, count: 1 }], totalInjections: 1 })
  expect(Option.getOrNull(injectionFrequency(injections))).toEqual({
    totalInjections: 1,
    avgDaysBetween: 0,
    mostFrequentDayOfWeek: 0,
    injectionsPerWeek: 1,
  })
  expect(injectionFrequency({ entries: [], timezone })).toEqual(Option.none())
})
