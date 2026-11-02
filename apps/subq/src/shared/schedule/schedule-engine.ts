import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import { addCalendarDays, calendarDaysBetween, projectInstantToCalendarDate } from '../calendar/domain.js'
import type { CalendarDate, IanaTimezone } from '../calendar/domain.js'
import type { InjectionLog } from '../injection/domain.js'
import { NextScheduledDose, PhaseInjectionSummary, PhaseOrder, SchedulePhaseView, ScheduleView } from './domain.js'
import type { InjectionSchedule, SchedulePhase } from './domain.js'

export interface CurrentPhase {
  readonly phaseIndex: number
  readonly phase: SchedulePhase
}

export interface NextDoseTiming {
  readonly suggestedDate: CalendarDate
  readonly daysUntilDue: number
  readonly isOverdue: boolean
}

export interface NextDoseTimingInput {
  readonly startDate: CalendarDate
  readonly frequency: string
  readonly lastInjectionDate: Option.Option<CalendarDate>
  readonly today: CalendarDate
}

type PhaseStatus = 'completed' | 'current' | 'upcoming'

export const frequencyToDays = (frequency: string): number =>
  Match.value(frequency).pipe(
    Match.when('daily', () => 1),
    Match.when('every_3_days', () => 3),
    Match.when('weekly', () => 7),
    Match.when('every_2_weeks', () => 14),
    Match.when('monthly', () => 30),
    Match.orElse(() => 7)
  )

export const nextDoseTiming = ({
  startDate,
  frequency,
  lastInjectionDate,
  today,
}: NextDoseTimingInput): NextDoseTiming => {
  const suggestedDate = Option.match(lastInjectionDate, {
    onNone: () => (today > startDate ? today : startDate),
    onSome: (lastDate) => addCalendarDays(lastDate, frequencyToDays(frequency)),
  })

  const daysUntilDue = calendarDaysBetween(today, suggestedDate)

  return {
    suggestedDate,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
  }
}

interface PhaseWindow extends CurrentPhase {
  readonly daysBeforePhase: number
}

export const currentPhase: {
  (today: CalendarDate): (schedule: InjectionSchedule) => Option.Option<CurrentPhase>
  (schedule: InjectionSchedule, today: CalendarDate): Option.Option<CurrentPhase>
} = Function.dual(2, (schedule: InjectionSchedule, today: CalendarDate): Option.Option<CurrentPhase> => {
  const daysSinceStart = calendarDaysBetween(schedule.startDate, today)

  const [, phaseWindows] = Arr.mapAccum(
    schedule.phases,
    0,
    (daysBeforePhase, phase, phaseIndex): readonly [number, PhaseWindow] => [
      daysBeforePhase + (phase.durationDays ?? 0),
      { phaseIndex, phase, daysBeforePhase },
    ]
  )

  const active = Arr.findFirst(
    phaseWindows,
    ({ daysBeforePhase, phase }) => phase.durationDays === null || daysSinceStart < daysBeforePhase + phase.durationDays
  )

  return active.pipe(
    Option.orElse(() => Arr.last(phaseWindows)),
    Option.map(({ phase, phaseIndex }) => ({ phaseIndex, phase }))
  )
})

export const nextDose: {
  (
    lastInjectionDate: Option.Option<CalendarDate>,
    today: CalendarDate
  ): (schedule: InjectionSchedule) => Option.Option<NextScheduledDose>
  (
    schedule: InjectionSchedule,
    lastInjectionDate: Option.Option<CalendarDate>,
    today: CalendarDate
  ): Option.Option<NextScheduledDose>
} = Function.dual(
  3,
  (
    schedule: InjectionSchedule,
    lastInjectionDate: Option.Option<CalendarDate>,
    today: CalendarDate
  ): Option.Option<NextScheduledDose> => {
    const activePhase = currentPhase(schedule, today)

    return Option.map(activePhase, (active) => {
      const timing = nextDoseTiming({
        startDate: schedule.startDate,
        frequency: schedule.frequency,
        lastInjectionDate,
        today,
      })

      return NextScheduledDose.make({
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        drug: schedule.drug,
        doseMg: active.phase.doseMg,
        suggestedDate: timing.suggestedDate,
        currentPhase: PhaseOrder.make(active.phaseIndex + 1),
        totalPhases: schedule.phases.length,
        daysUntilDue: timing.daysUntilDue,
        isOverdue: timing.isOverdue,
      })
    })
  }
)

const phaseStatus = (
  phaseStartDate: CalendarDate,
  phaseEndDate: Option.Option<CalendarDate>,
  today: CalendarDate
): PhaseStatus =>
  Option.match(phaseEndDate, {
    onNone: () => (today >= phaseStartDate ? 'current' : 'upcoming'),
    onSome: (endDate) => {
      if (today > endDate) {
        return 'completed'
      }

      return today >= phaseStartDate ? 'current' : 'upcoming'
    },
  })

const phaseContainsInjection = (
  phaseStartDate: CalendarDate,
  phaseEndDate: Option.Option<CalendarDate>,
  injection: InjectionLog,
  timezone: IanaTimezone
): boolean => {
  const injectionDate = projectInstantToCalendarDate(injection.datetime, timezone)

  return Option.match(phaseEndDate, {
    onNone: () => injectionDate >= phaseStartDate,
    onSome: (endDate) => injectionDate >= phaseStartDate && injectionDate <= endDate,
  })
}

export const scheduleView: {
  (
    injections: ReadonlyArray<InjectionLog>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): (schedule: InjectionSchedule) => ScheduleView
  (
    schedule: InjectionSchedule,
    injections: ReadonlyArray<InjectionLog>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): ScheduleView
} = Function.dual(
  4,
  (
    schedule: InjectionSchedule,
    injections: ReadonlyArray<InjectionLog>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): ScheduleView => {
    const intervalDays = frequencyToDays(schedule.frequency)

    const [, phases] = Arr.mapAccum(
      schedule.phases,
      0,
      (cumulativeDays, phase): readonly [number, SchedulePhaseView] => {
        const phaseStartDate = addCalendarDays(schedule.startDate, cumulativeDays)

        const phaseEndDate =
          phase.durationDays === null
            ? Option.none<CalendarDate>()
            : Option.some(addCalendarDays(phaseStartDate, phase.durationDays - 1))

        const phaseInjections = Arr.filter(injections, (injection) =>
          phaseContainsInjection(phaseStartDate, phaseEndDate, injection, timezone)
        )

        const phaseView = SchedulePhaseView.make({
          id: phase.id,
          order: phase.order,
          durationDays: phase.durationDays,
          doseMg: phase.doseMg,
          startDate: phaseStartDate,
          endDate: Option.getOrNull(phaseEndDate),
          status: phaseStatus(phaseStartDate, phaseEndDate, today),
          expectedInjections: phase.durationDays === null ? null : Math.ceil(phase.durationDays / intervalDays),
          completedInjections: phaseInjections.length,
          injections: Arr.map(phaseInjections, (injection) =>
            PhaseInjectionSummary.make({
              id: injection.id,
              datetime: injection.datetime,
              doseMg: injection.doseMg,
              injectionSite: injection.injectionSite,
            })
          ),
        })

        return [cumulativeDays + (phase.durationDays ?? 0), phaseView]
      }
    )

    const hasIndefinitePhase = Arr.some(schedule.phases, (phase) => phase.durationDays === null)
    const totalDurationDays = Arr.reduce(schedule.phases, 0, (sum, phase) => sum + (phase.durationDays ?? 0))
    const endDate = hasIndefinitePhase ? null : addCalendarDays(schedule.startDate, totalDurationDays - 1)

    const totalExpectedInjections = hasIndefinitePhase
      ? null
      : Arr.reduce(phases, 0, (sum, phase) => sum + (phase.expectedInjections ?? 0))

    return ScheduleView.make({
      id: schedule.id,
      name: schedule.name,
      drug: schedule.drug,
      supplier: schedule.supplier,
      frequency: schedule.frequency,
      startDate: schedule.startDate,
      endDate,
      isActive: schedule.isActive,
      notes: schedule.notes,
      totalExpectedInjections,
      totalCompletedInjections: Arr.reduce(phases, 0, (sum, phase) => sum + phase.completedInjections),
      phases,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    })
  }
)
