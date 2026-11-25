import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { IanaTimezone } from './Calendar.ts'
import { ScheduleId, SchedulePhaseId } from './Journal/Journal.id.ts'
import { Goal, InjectionEntry, Preferences, Schedule, SchedulePhase, WeightEntry } from './Journal/JournalRecords.ts'
import { WeightUnit } from './Values.ts'

export const JournalSnapshot = Schema.Struct({
  version: Schema.Literal('4.0.0'),
  exportedAt: Schema.DateTimeUtc,
  data: Schema.Struct({
    preferences: Preferences,
    weights: Schema.Array(WeightEntry),
    injections: Schema.Array(InjectionEntry),
    schedules: Schema.Array(Schedule),
    goals: Schema.Array(Goal),
  }),
})
export type JournalSnapshot = typeof JournalSnapshot.Type
export const JournalSnapshotJson = JournalSnapshot.pipe(Schema.toCodecJson, Schema.fromJsonString)

const LegacyPhase = Schema.Struct({
  ...SchedulePhase.fields,
  scheduleId: ScheduleId,
})
const LegacyWeight = Schema.Struct({
  ...Struct.omit(WeightEntry.fields, ['recordedAt', 'weightLbs']),
  datetime: WeightEntry.fields.recordedAt,
  weight: WeightEntry.fields.weightLbs,
})
const LegacyInjection = Schema.Struct({
  ...Struct.omit(InjectionEntry.fields, ['administeredAt', 'compound', 'site']),
  datetime: InjectionEntry.fields.administeredAt,
  drug: InjectionEntry.fields.compound,
  injectionSite: InjectionEntry.fields.site,
})
const LegacySchedule = Schema.Struct({
  ...Struct.omit(Schedule.fields, ['compound', 'phases']),
  drug: Schedule.fields.compound,
  phases: Schema.Array(LegacyPhase),
})
const LegacyGoal = Schema.Struct({
  ...Struct.omit(Goal.fields, ['goalWeightLbs', 'startingWeightLbs']),
  goalWeight: Goal.fields.goalWeightLbs,
  startingWeight: Goal.fields.startingWeightLbs,
})

const LegacyExport = Schema.Struct({
  version: Schema.Literal('3.0.0-alpha.2'),
  exportedAt: Schema.DateTimeUtc,
  data: Schema.Struct({
    settings: Schema.NullOr(
      Schema.Struct({
        weightUnit: WeightUnit,
        timezone: IanaTimezone,
      })
    ),
    weightLogs: Schema.Array(LegacyWeight),
    injectionLogs: Schema.Array(LegacyInjection),
    schedules: Schema.Array(LegacySchedule),
    goals: Schema.Array(LegacyGoal),
  }),
})

export class LegacyPhaseScheduleMismatch extends Schema.TaggedError<
  LegacyPhaseScheduleMismatch,
  { readonly brand: unique symbol }
>()(
  'LegacyPhaseScheduleMismatch',
  {
    phaseId: SchedulePhaseId,
    scheduleId: ScheduleId,
    referencedScheduleId: ScheduleId,
  },
  { httpApiStatus: 422 }
) {}

const LegacyExportCodec = Schema.toCodecJson(LegacyExport)
const decodeLegacyExport = Schema.decodeUnknownEffect(LegacyExportCodec)
const decodeLegacyJson = LegacyExportCodec.pipe(Schema.fromJsonString, Schema.decodeUnknownEffect)

export const decodeLegacyV3Export = Effect.fn('subq.decodeLegacyV3Export')(function* (input: unknown) {
  const { exportedAt, data } = yield* Predicate.isString(input) ? decodeLegacyJson(input) : decodeLegacyExport(input)
  const mismatch = Arr.findFirst(
    Arr.flatMap(data.schedules, ({ id: scheduleId, phases }) => Arr.map(phases, (phase) => ({ scheduleId, phase }))),
    ({ scheduleId, phase }) => phase.scheduleId !== scheduleId
  )
  if (Option.isSome(mismatch)) {
    const { scheduleId, phase } = mismatch.value
    return yield* LegacyPhaseScheduleMismatch.make({
      phaseId: phase.id,
      scheduleId,
      referencedScheduleId: phase.scheduleId,
    })
  }
  return {
    version: '4.0.0',
    exportedAt,
    data: {
      preferences: data.settings ?? {},
      weights: Arr.map(data.weightLogs, ({ datetime, weight, ...entry }) => ({
        ...entry,
        recordedAt: datetime,
        weightLbs: weight,
      })),
      injections: Arr.map(data.injectionLogs, ({ datetime, drug, injectionSite, ...entry }) => ({
        ...entry,
        administeredAt: datetime,
        compound: drug,
        site: injectionSite,
      })),
      schedules: Arr.map(data.schedules, ({ drug, phases, ...schedule }) => ({
        ...schedule,
        compound: drug,
        phases: Arr.sortWith(
          Arr.map(phases, (phase) => Struct.omit(phase, ['scheduleId'])),
          (phase) => phase.order,
          Order.Number
        ),
      })),
      goals: Arr.map(data.goals, ({ goalWeight, startingWeight, ...goal }) => ({
        ...goal,
        goalWeightLbs: goalWeight,
        startingWeightLbs: startingWeight,
      })),
    },
  } satisfies JournalSnapshot
})
