import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import { calendarDaysBetween, projectInstantToCalendarDate } from '../calendar/domain.js'
import type { CalendarDate, IanaTimezone } from '../calendar/domain.js'
import type { DoseMg, MedicationCompound } from '../common/domain.js'
import type { InjectionLog } from '../injection/domain.js'

export interface ScheduleInferencePhase {
  readonly order: number
  readonly durationDays: Option.Option<number>
  readonly doseMg: DoseMg
}

/** Draft schedule inferred from canonical injection history in the persisted timezone. */
export interface ScheduleInferenceDraft {
  readonly name: string
  readonly drug: MedicationCompound
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
export const inferScheduleDraftFromInjectionLogs = (
  injections: ReadonlyArray<InjectionLog>,
  timezone: IanaTimezone
): Option.Option<ScheduleInferenceDraft> => {
  const firstInjection = Arr.head(injections)
  return Option.map(firstInjection, (first) => {
    const allDatetimes = Arr.map(injections, (injection) => injection.datetime)
    const startDate = projectInstantToCalendarDate(earliestInstant(Arr.prepend(allDatetimes, first.datetime)), timezone)
    const uniqueDoses = Arr.dedupeWith(injections, (left, right) => left.doseMg === right.doseMg)
    const phaseStarts = uniqueDoses
      .map((injection) => {
        const matchingDates = injections
          .filter((candidate) => candidate.doseMg === injection.doseMg)
          .map((candidate) => candidate.datetime)
        const phaseStartInstant = earliestInstant(Arr.prepend(matchingDates, injection.datetime))
        return {
          doseMg: injection.doseMg,
          phaseStartDate: projectInstantToCalendarDate(phaseStartInstant, timezone),
          phaseStartInstant,
        }
      })
      .toSorted(
        (left, right) =>
          DateTime.toEpochMillis(left.phaseStartInstant) - DateTime.toEpochMillis(right.phaseStartInstant)
      )

    return {
      name: `${first.drug} Schedule`,
      drug: first.drug,
      startDate,
      phases: phaseStarts.map((phase, index) => {
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
