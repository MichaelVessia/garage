import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'

import type { InjectionLog } from '../injection/domain.js'
const DAY_MILLIS = 1000 * 60 * 60 * 24
export interface ScheduleInferencePhase {
  readonly order: number
  readonly durationDays: Option.Option<number>
  readonly dosage: string
}
export interface ScheduleInferenceDraft {
  readonly name: string
  readonly drug: string
  readonly startDate: DateTime.Utc
  readonly phases: ReadonlyArray<ScheduleInferencePhase>
}
const earliestDate = (dates: Arr.NonEmptyReadonlyArray<DateTime.Utc>): DateTime.Utc => {
  const head = Arr.headNonEmpty(dates)
  return Arr.reduce(dates, head, (earliest, date) =>
    DateTime.toEpochMillis(date) < DateTime.toEpochMillis(earliest) ? date : earliest
  )
}
export const inferScheduleDraftFromInjectionLogs = (
  injections: ReadonlyArray<InjectionLog>
): Option.Option<ScheduleInferenceDraft> => {
  const firstInjectionOpt = Arr.head(injections)
  return Option.map(firstInjectionOpt, (firstInjection) => {
    const allDatetimes = Arr.map(injections, (injection) => injection.datetime)
    const startDate = earliestDate(Arr.prepend(allDatetimes, firstInjection.datetime))
    const injectionsByDosage = Arr.groupBy(injections, (injection) => injection.dosage)
    const dosageStartDates = R.map(injectionsByDosage, (group) => {
      const groupDatetimes = Arr.map(group, (injection) => injection.datetime)
      return earliestDate(groupDatetimes)
    })
    const phaseStarts = R.toEntries(dosageStartDates)
      .map(([dosage, phaseStartDate]) => ({ dosage, phaseStartDate }))
      .toSorted((a, b) => DateTime.toEpochMillis(a.phaseStartDate) - DateTime.toEpochMillis(b.phaseStartDate))
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
          dosage: phase.dosage,
        }
      }),
    }
  })
}
