import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Rec from 'effect/Record'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { InjectionSite } from '../Values.ts'
import { GoalId, InjectionId, ScheduleId, WeightId } from './Journal.id.ts'
import { Goal, InjectionEntry, Preferences, Schedule, WeightEntry } from './JournalRecords.ts'

export const Weights = Schema.Record(WeightId, WeightEntry)
export const Injections = Schema.Record(InjectionId, InjectionEntry)
export const Schedules = Schema.Record(ScheduleId, Schedule)
export const Goals = Schema.Record(GoalId, Goal)

export const JournalState = Schema.Struct({
  preferences: Preferences,
  weights: Weights,
  injections: Injections,
  schedules: Schedules,
  goals: Goals,
})
export type JournalState = typeof JournalState.Type

export const emptyJournal: JournalState = { preferences: {}, weights: {}, injections: {}, schedules: {}, goals: {} }

export const WeightSummary = Schema.Struct({ latestWeight: Schema.NullOr(WeightEntry) })
export const InjectionSummary = Schema.Struct({
  lastInjection: Schema.NullOr(InjectionEntry),
  knownSites: Schema.Array(InjectionSite),
})

const latestBy = <A>(entries: ReadonlyArray<A>, time: (entry: A) => DateTime.Utc): Option.Option<A> =>
  Arr.reduce(entries, Option.none<A>(), (latest, entry) =>
    Option.isNone(latest) || DateTime.Order(time(entry), time(latest.value)) > 0 ? Option.some(entry) : latest
  )

export const summarizeWeights = (weights: typeof Weights.Type): typeof WeightSummary.Type => ({
  latestWeight: Option.getOrNull(latestBy(Rec.values(weights), (entry) => entry.recordedAt)),
})

export const summarizeInjections = (injections: typeof Injections.Type): typeof InjectionSummary.Type => {
  const entries = Rec.values(injections)
  return {
    lastInjection: Option.getOrNull(latestBy(entries, (entry) => entry.administeredAt)),
    knownSites: Arr.sort(
      Arr.dedupe(
        Arr.filterMap(entries, (entry) => (entry.site === null ? Result.failVoid : Result.succeed(entry.site)))
      ),
      Order.String
    ),
  }
}

export const putEntries = <Id extends string, Entry extends { readonly id: Id }>({
  entries,
  updates,
}: {
  readonly entries: Readonly<Record<Id, Entry>>
  readonly updates: ReadonlyArray<Entry>
}): Readonly<Record<Id, Entry>> => ({ ...entries, ...Rec.fromIterableBy(updates, (entry) => entry.id) })

export const applyScheduleRemoval = ({
  injections,
  unassignedInjectionIds,
  updatedAt,
}: {
  readonly injections: typeof Injections.Type
  readonly unassignedInjectionIds: ReadonlyArray<InjectionId>
  readonly updatedAt: DateTime.Utc
}): typeof Injections.Type =>
  putEntries({
    entries: injections,
    updates: Arr.filterMap(unassignedInjectionIds, (id) =>
      Rec.get(injections, id).pipe(
        Result.fromOption(() => undefined),
        Result.map((entry) => ({
          ...entry,
          scheduleId: null,
          updatedAt,
        }))
      )
    ),
  })
