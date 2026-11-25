import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { addCalendarDays, calendarDaysBetween, projectInstantToCalendarDate, CalendarDate } from './Calendar.ts'
import type { IanaTimezone } from './Calendar.ts'
import { InjectionId, ScheduleId, SchedulePhaseId } from './Journal/Journal.id.ts'
import type { InjectionEntry, Schedule, SchedulePhase } from './Journal/JournalRecords.ts'
import {
  DoseMg,
  Frequency,
  InjectionSite,
  MedicationCompound,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  Supplier,
} from './Values.ts'

export const NextScheduledDose = Schema.Struct({
  scheduleId: ScheduleId,
  scheduleName: ScheduleName,
  compound: MedicationCompound,
  doseMg: DoseMg,
  suggestedDate: CalendarDate,
  currentPhase: PhaseOrder,
  totalPhases: Schema.Int,
  daysUntilDue: Schema.Int,
  isOverdue: Schema.Boolean,
})
export type NextScheduledDose = typeof NextScheduledDose.Type

/**
 * Summary of a completed injection associated with a schedule phase.
 */
export const PhaseInjectionSummary = Schema.Struct({
  id: InjectionId,
  administeredAt: Schema.DateTimeUtc,
  doseMg: DoseMg,
  site: Schema.NullOr(InjectionSite),
})
export type PhaseInjectionSummary = typeof PhaseInjectionSummary.Type

/**
 * Progress and details for a single phase in the schedule view.
 * If durationDays is null, the phase is indefinite (no end date).
 */
export const SchedulePhaseView = Schema.Struct({
  id: SchedulePhaseId,
  order: PhaseOrder,
  durationDays: Schema.NullOr(PhaseDurationDays),
  doseMg: DoseMg,
  startDate: CalendarDate,
  endDate: Schema.NullOr(CalendarDate),
  status: Schema.Literals(['completed', 'current', 'upcoming'] as const),
  expectedInjections: Schema.NullOr(Schema.Int),
  completedInjections: Schema.Int,
  injections: Schema.Array(PhaseInjectionSummary),
})
export type SchedulePhaseView = typeof SchedulePhaseView.Type

/**
 * Full schedule view with all phases and their progress.
 * If endDate is null, the schedule has an indefinite final phase.
 */
export const ScheduleView = Schema.Struct({
  id: ScheduleId,
  name: ScheduleName,
  compound: MedicationCompound,
  supplier: Schema.NullOr(Supplier),
  frequency: Frequency,
  startDate: CalendarDate,
  endDate: Schema.NullOr(CalendarDate),
  isActive: Schema.Boolean,
  notes: Schema.NullOr(Notes),
  totalExpectedInjections: Schema.NullOr(Schema.Int),
  totalCompletedInjections: Schema.Int,
  phases: Schema.Array(SchedulePhaseView),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
})
export type ScheduleView = typeof ScheduleView.Type

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
  readonly frequency: Frequency
  readonly lastInjectionDate: Option.Option<CalendarDate>
  readonly today: CalendarDate
}

type PhaseStatus = 'completed' | 'current' | 'upcoming'

const frequencyDays = {
  daily: 1,
  every_3_days: 3,
  weekly: 7,
  every_2_weeks: 14,
  monthly: 30,
} satisfies Record<Frequency, number>

export const frequencyToDays = (frequency: Frequency): number => frequencyDays[frequency]

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
  (today: CalendarDate): (schedule: Schedule) => Option.Option<CurrentPhase>
  (schedule: Schedule, today: CalendarDate): Option.Option<CurrentPhase>
} = Function.dual(2, (schedule: Schedule, today: CalendarDate): Option.Option<CurrentPhase> => {
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

export const nextDose = ({
  schedule,
  injections,
  today,
  timezone,
}: {
  readonly schedule: Schedule
  readonly injections: ReadonlyArray<InjectionEntry>
  readonly today: CalendarDate
  readonly timezone: IanaTimezone
}): Option.Option<NextScheduledDose> => {
  const latest = Arr.reduce(injections, Option.none<DateTime.Utc>(), (previous, entry) => {
    if (entry.compound !== schedule.compound) {
      return previous
    }
    return Option.isNone(previous) || DateTime.Order(entry.administeredAt, previous.value) > 0
      ? Option.some(entry.administeredAt)
      : previous
  })
  return Option.map(currentPhase(schedule, today), ({ phase, phaseIndex }) => ({
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    compound: schedule.compound,
    doseMg: phase.doseMg,
    currentPhase: PhaseOrder.make(phaseIndex + 1),
    totalPhases: schedule.phases.length,
    ...nextDoseTiming({
      startDate: schedule.startDate,
      frequency: schedule.frequency,
      lastInjectionDate: Option.map(latest, projectInstantToCalendarDate(timezone)),
      today,
    }),
  }))
}

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

export const scheduleView: {
  (
    injections: ReadonlyArray<InjectionEntry>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): (schedule: Schedule) => ScheduleView
  (
    schedule: Schedule,
    injections: ReadonlyArray<InjectionEntry>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): ScheduleView
} = Function.dual(
  4,
  (
    schedule: Schedule,
    injections: ReadonlyArray<InjectionEntry>,
    today: CalendarDate,
    timezone: IanaTimezone
  ): ScheduleView => {
    const assigned = Arr.map(
      Arr.sortWith(
        Arr.filter(injections, (entry) => entry.scheduleId === schedule.id),
        (entry: InjectionEntry) => entry.administeredAt,
        DateTime.Order
      ),
      (entry) => ({
        entry,
        date: projectInstantToCalendarDate(entry.administeredAt, timezone),
      })
    )
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

        const phaseInjections = Arr.filter(
          assigned,
          ({ date }) => date >= phaseStartDate && (Option.isNone(phaseEndDate) || date <= phaseEndDate.value)
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
          injections: Arr.map(phaseInjections, ({ entry: injection }) =>
            PhaseInjectionSummary.make({
              id: injection.id,
              administeredAt: injection.administeredAt,
              doseMg: injection.doseMg,
              site: injection.site,
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
      compound: schedule.compound,
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
export interface ScheduleInferencePhase {
  readonly order: number
  readonly durationDays: Option.Option<number>
  readonly doseMg: DoseMg
}

/** Draft schedule inferred from canonical injection history in the persisted timezone. */
export interface ScheduleInferenceDraft {
  readonly name: string
  readonly compound: MedicationCompound
  readonly startDate: CalendarDate
  readonly phases: ReadonlyArray<ScheduleInferencePhase>
}

const earliestInstant = (dates: Arr.NonEmptyReadonlyArray<DateTime.Utc>): DateTime.Utc => {
  const head = Arr.headNonEmpty(dates)

  return Arr.reduce(dates, head, (earliest, date) =>
    DateTime.toEpochMillis(date) < DateTime.toEpochMillis(earliest) ? date : earliest
  )
}

/** Infer a schedule draft by finding the first local-calendar use of each numeric dose. */
export const inferScheduleDraftFromInjections: {
  (timezone: IanaTimezone): (injections: ReadonlyArray<InjectionEntry>) => Option.Option<ScheduleInferenceDraft>
  (injections: ReadonlyArray<InjectionEntry>, timezone: IanaTimezone): Option.Option<ScheduleInferenceDraft>
} = Function.dual(
  2,
  (injections: ReadonlyArray<InjectionEntry>, timezone: IanaTimezone): Option.Option<ScheduleInferenceDraft> => {
    const firstInjection = Arr.head(injections)

    return Option.map(firstInjection, (first) => {
      const allDatetimes = Arr.map(injections, (injection) => injection.administeredAt)

      const startDate = projectInstantToCalendarDate(
        earliestInstant(Arr.prepend(allDatetimes, first.administeredAt)),
        timezone
      )

      const uniqueDoses = Arr.dedupeWith(injections, (left, right) => left.doseMg === right.doseMg)

      const phaseCandidates = Arr.map(uniqueDoses, (injection) => {
        const matchingDates = Arr.map(
          Arr.filter(injections, (candidate) => candidate.doseMg === injection.doseMg),
          (candidate) => candidate.administeredAt
        )

        const phaseStartInstant = earliestInstant(Arr.prepend(matchingDates, injection.administeredAt))

        return {
          doseMg: injection.doseMg,
          phaseStartDate: projectInstantToCalendarDate(phaseStartInstant, timezone),
          phaseStartInstant,
        }
      })

      const phaseStarts = Arr.sortWith(phaseCandidates, (phase) => phase.phaseStartInstant, DateTime.Order)

      return {
        name: `${first.compound} Schedule`,
        compound: first.compound,
        startDate,
        phases: Arr.map(phaseStarts, (phase, index) => {
          const nextPhase = Arr.get(phaseStarts, index + 1)

          return {
            order: index + 1,
            durationDays: Option.map(nextPhase, (next) =>
              Math.max(1, calendarDaysBetween(phase.phaseStartDate, next.phaseStartDate))
            ),
            doseMg: phase.doseMg,
          }
        }),
      }
    })
  }
)
