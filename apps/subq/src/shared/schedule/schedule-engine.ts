import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { InjectionLog } from '../injection/domain.js'
import { NextScheduledDose, PhaseInjectionSummary, PhaseOrder, SchedulePhaseView, ScheduleView } from './domain.js'
import type { InjectionSchedule, SchedulePhase } from './domain.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CurrentPhase {
  readonly phaseIndex: number
  readonly phase: SchedulePhase
}

export interface NextDoseTiming {
  readonly suggestedDate: DateTime.Utc
  readonly daysUntilDue: number
  readonly isOverdue: boolean
}

export interface NextDoseTimingInput {
  readonly startDate: DateTime.Utc
  readonly frequency: string
  readonly lastInjectionDate: Option.Option<DateTime.Utc>
  readonly now: DateTime.Utc
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

const addDays = (date: DateTime.Utc, days: number): DateTime.Utc =>
  DateTime.makeUnsafe(DateTime.toEpochMillis(date) + days * MS_PER_DAY)

const daysBetweenFloor = (start: DateTime.Utc, end: DateTime.Utc): number =>
  Math.floor((DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start)) / MS_PER_DAY)

const daysUntilRounded = (date: DateTime.Utc, now: DateTime.Utc): number =>
  Math.round((DateTime.toEpochMillis(date) - DateTime.toEpochMillis(now)) / MS_PER_DAY)

export const nextDoseTiming = ({
  startDate,
  frequency,
  lastInjectionDate,
  now,
}: NextDoseTimingInput): NextDoseTiming => {
  const suggestedDate = Option.match(lastInjectionDate, {
    onNone: () => (DateTime.isGreaterThan(now, startDate) ? now : startDate),
    onSome: (lastDate) => addDays(lastDate, frequencyToDays(frequency)),
  })
  const daysUntilDue = daysUntilRounded(suggestedDate, now)

  return {
    suggestedDate,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
  }
}

interface PhaseWindow extends CurrentPhase {
  readonly daysBeforePhase: number
}

export const currentPhase = (schedule: InjectionSchedule, now: DateTime.Utc): Option.Option<CurrentPhase> => {
  const daysSinceStart = daysBetweenFloor(schedule.startDate, now)
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
}

export const nextDose = (
  schedule: InjectionSchedule,
  lastInjectionDate: Option.Option<DateTime.Utc>,
  now: DateTime.Utc
): Option.Option<NextScheduledDose> => {
  const activePhase = currentPhase(schedule, now)

  return Option.map(activePhase, (active) => {
    const timing = nextDoseTiming({
      startDate: schedule.startDate,
      frequency: schedule.frequency,
      lastInjectionDate,
      now,
    })

    return new NextScheduledDose({
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

const phaseStatus = (
  phaseStartDate: DateTime.Utc,
  phaseEndDate: Option.Option<DateTime.Utc>,
  now: DateTime.Utc
): PhaseStatus =>
  Option.match(phaseEndDate, {
    onNone: () => (DateTime.isGreaterThanOrEqualTo(now, phaseStartDate) ? 'current' : 'upcoming'),
    onSome: (endDate) => {
      if (DateTime.isGreaterThan(now, endDate)) {
        return 'completed'
      }

      return DateTime.isGreaterThanOrEqualTo(now, phaseStartDate) ? 'current' : 'upcoming'
    },
  })

const phaseContainsInjection = (
  phaseStartDate: DateTime.Utc,
  phaseEndDate: Option.Option<DateTime.Utc>,
  injection: InjectionLog
): boolean =>
  Option.match(phaseEndDate, {
    onNone: () => DateTime.isGreaterThanOrEqualTo(injection.datetime, phaseStartDate),
    onSome: (endDate) =>
      DateTime.isGreaterThanOrEqualTo(injection.datetime, phaseStartDate) &&
      DateTime.isLessThanOrEqualTo(injection.datetime, endDate),
  })

export const scheduleView = (
  schedule: InjectionSchedule,
  injections: readonly InjectionLog[],
  now: DateTime.Utc
): ScheduleView => {
  const intervalDays = frequencyToDays(schedule.frequency)
  const [, phases] = Arr.mapAccum(schedule.phases, 0, (cumulativeDays, phase): readonly [number, SchedulePhaseView] => {
    const phaseStartDate = addDays(schedule.startDate, cumulativeDays)
    const phaseEndDate =
      phase.durationDays === null
        ? Option.none<DateTime.Utc>()
        : Option.some(addDays(phaseStartDate, phase.durationDays - 1))
    const phaseInjections = injections.filter((injection) =>
      phaseContainsInjection(phaseStartDate, phaseEndDate, injection)
    )

    const phaseView = new SchedulePhaseView({
      id: phase.id,
      order: phase.order,
      durationDays: phase.durationDays,
      doseMg: phase.doseMg,
      startDate: phaseStartDate,
      endDate: Option.getOrNull(phaseEndDate),
      status: phaseStatus(phaseStartDate, phaseEndDate, now),
      expectedInjections: phase.durationDays === null ? null : Math.ceil(phase.durationDays / intervalDays),
      completedInjections: phaseInjections.length,
      injections: phaseInjections.map(
        (injection) =>
          new PhaseInjectionSummary({
            id: injection.id,
            datetime: injection.datetime,
            doseMg: injection.doseMg,
            injectionSite: injection.injectionSite,
          })
      ),
    })

    return [cumulativeDays + (phase.durationDays ?? 0), phaseView]
  })

  const hasIndefinitePhase = schedule.phases.some((phase) => phase.durationDays === null)
  const totalDurationDays = schedule.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0)
  const endDate = hasIndefinitePhase ? null : addDays(schedule.startDate, totalDurationDays - 1)
  const totalExpectedInjections = hasIndefinitePhase
    ? null
    : phases.reduce((sum, phase) => sum + (phase.expectedInjections ?? 0), 0)

  return new ScheduleView({
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
    totalCompletedInjections: phases.reduce((sum, phase) => sum + phase.completedInjections, 0),
    phases,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  })
}
