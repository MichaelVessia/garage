import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import type { DoseMg, MedicationCompound } from '../common/domain.js'
import type { InjectionLog } from '../injection/domain.js'

const DAY_MILLIS = 1000 * 60 * 60 * 24

/** One inferred titration phase. */
export interface ScheduleInferencePhase {
  readonly order: number
  readonly durationDays: Option.Option<number>
  readonly doseMg: DoseMg
}

/** Draft schedule inferred from canonical injection history. */
export interface ScheduleInferenceDraft {
  readonly name: string
  readonly drug: MedicationCompound
  readonly startDate: DateTime.Utc
  readonly phases: ReadonlyArray<ScheduleInferencePhase>
}

const earliestDate = (dates: Arr.NonEmptyReadonlyArray<DateTime.Utc>): DateTime.Utc => {
  const head = Arr.headNonEmpty(dates)
  return Arr.reduce(dates, head, (earliest, date) =>
    DateTime.toEpochMillis(date) < DateTime.toEpochMillis(earliest) ? date : earliest
  )
}

/** Infer a schedule draft by finding the first use of each numeric dose. */
export const inferScheduleDraftFromInjectionLogs = (
  injections: ReadonlyArray<InjectionLog>
): Option.Option<ScheduleInferenceDraft> => {
  const firstInjectionOpt = Arr.head(injections)
  return Option.map(firstInjectionOpt, (firstInjection) => {
    const allDatetimes = Arr.map(injections, (injection) => injection.datetime)
    const startDate = earliestDate(Arr.prepend(allDatetimes, firstInjection.datetime))
    const uniqueDoses = Arr.dedupeWith(injections, (left, right) => left.doseMg === right.doseMg)
    const phaseStarts = uniqueDoses
      .map((injection) => {
        const matchingDates = injections
          .filter((candidate) => candidate.doseMg === injection.doseMg)
          .map((candidate) => candidate.datetime)
        return {
          doseMg: injection.doseMg,
          phaseStartDate: earliestDate(Arr.prepend(matchingDates, injection.datetime)),
        }
      })
      .toSorted(
        (left, right) => DateTime.toEpochMillis(left.phaseStartDate) - DateTime.toEpochMillis(right.phaseStartDate)
      )

    return {
      name: `${firstInjection.drug} Schedule`,
      drug: firstInjection.drug,
      startDate,
      phases: phaseStarts.map((phase, index) => {
        const nextPhase = Arr.get(phaseStarts, index + 1)
        return {
          order: index + 1,
          durationDays: Option.map(nextPhase, (next) =>
            Math.max(
              1,
              Math.round(
                (DateTime.toEpochMillis(next.phaseStartDate) - DateTime.toEpochMillis(phase.phaseStartDate)) /
                  DAY_MILLIS
              )
            )
          ),
          doseMg: phase.doseMg,
        }
      }),
    }
  })
}
