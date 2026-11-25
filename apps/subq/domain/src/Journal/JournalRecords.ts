import * as Schema from 'effect/Schema'

import { CalendarDate, IanaTimezone } from '../Calendar.ts'
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
  WeightLbs,
  WeightUnit,
} from '../Values.ts'
import { GoalId, InjectionId, ScheduleId, SchedulePhaseId, WeightId } from './Journal.id.ts'

export const Preferences = Schema.Struct({
  weightUnit: Schema.optionalKey(WeightUnit),
  timezone: Schema.optionalKey(IanaTimezone),
})
export type Preferences = typeof Preferences.Type

const Audit = {
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}

const WeightInput = Schema.Struct({
  recordedAt: Schema.DateTimeUtc,
  weightLbs: WeightLbs,
  notes: Schema.NullOr(Notes),
})
export const WeightEntry = Schema.Struct({ id: WeightId, ...WeightInput.fields, ...Audit })
export type WeightEntry = typeof WeightEntry.Type

const InjectionInput = Schema.Struct({
  administeredAt: Schema.DateTimeUtc,
  compound: MedicationCompound,
  doseMg: DoseMg,
  site: Schema.NullOr(InjectionSite),
  supplier: Schema.NullOr(Supplier),
  notes: Schema.NullOr(Notes),
  scheduleId: Schema.NullOr(ScheduleId),
})
export const InjectionEntry = Schema.Struct({ id: InjectionId, ...InjectionInput.fields, ...Audit })
export type InjectionEntry = typeof InjectionEntry.Type

export const PhaseInput = Schema.Struct({
  id: SchedulePhaseId,
  order: PhaseOrder,
  durationDays: Schema.NullOr(PhaseDurationDays),
  doseMg: DoseMg,
})
export const SchedulePhase = Schema.Struct({ ...PhaseInput.fields, ...Audit })
export type SchedulePhase = typeof SchedulePhase.Type

const ScheduleInput = Schema.Struct({
  name: ScheduleName,
  compound: MedicationCompound,
  supplier: Schema.NullOr(Supplier),
  frequency: Frequency,
  startDate: CalendarDate,
  notes: Schema.NullOr(Notes),
  phases: Schema.Array(PhaseInput),
})
export const Schedule = Schema.Struct({
  id: ScheduleId,
  ...ScheduleInput.fields,
  phases: Schema.Array(SchedulePhase),
  isActive: Schema.Boolean,
  ...Audit,
})
export type Schedule = typeof Schedule.Type

const GoalInput = Schema.Struct({
  goalWeightLbs: WeightLbs,
  startingDate: CalendarDate,
  targetDate: Schema.NullOr(CalendarDate),
  notes: Schema.NullOr(Notes),
})
export const Goal = Schema.Struct({
  id: GoalId,
  ...GoalInput.fields,
  startingWeightLbs: WeightLbs,
  isActive: Schema.Boolean,
  completedAt: Schema.NullOr(Schema.DateTimeUtc),
  ...Audit,
})
export type Goal = typeof Goal.Type

export const NewWeight = Schema.Struct({
  ...WeightInput.fields,
  notes: Schema.optionalKey(WeightInput.fields.notes),
})

export const NewInjection = Schema.Struct({
  ...InjectionInput.fields,
  site: Schema.optionalKey(InjectionInput.fields.site),
  supplier: Schema.optionalKey(InjectionInput.fields.supplier),
  notes: Schema.optionalKey(InjectionInput.fields.notes),
  scheduleId: Schema.optionalKey(InjectionInput.fields.scheduleId),
})

export const NewSchedule = Schema.Struct({
  ...ScheduleInput.fields,
  supplier: Schema.optionalKey(ScheduleInput.fields.supplier),
  notes: Schema.optionalKey(ScheduleInput.fields.notes),
})

export const WeightCorrection = Schema.Struct({
  recordedAt: Schema.optionalKey(WeightInput.fields.recordedAt),
  weightLbs: Schema.optionalKey(WeightInput.fields.weightLbs),
  notes: Schema.optionalKey(WeightInput.fields.notes),
})

export const InjectionCorrection = Schema.Struct({
  administeredAt: Schema.optionalKey(InjectionInput.fields.administeredAt),
  compound: Schema.optionalKey(InjectionInput.fields.compound),
  doseMg: Schema.optionalKey(InjectionInput.fields.doseMg),
  site: Schema.optionalKey(InjectionInput.fields.site),
  supplier: Schema.optionalKey(InjectionInput.fields.supplier),
  notes: Schema.optionalKey(InjectionInput.fields.notes),
  scheduleId: Schema.optionalKey(InjectionInput.fields.scheduleId),
})

export const ScheduleRevision = Schema.Struct({
  name: Schema.optionalKey(ScheduleInput.fields.name),
  compound: Schema.optionalKey(ScheduleInput.fields.compound),
  supplier: Schema.optionalKey(ScheduleInput.fields.supplier),
  frequency: Schema.optionalKey(ScheduleInput.fields.frequency),
  startDate: Schema.optionalKey(ScheduleInput.fields.startDate),
  notes: Schema.optionalKey(ScheduleInput.fields.notes),
  phases: Schema.optionalKey(ScheduleInput.fields.phases),
})

export const NewGoal = Schema.Struct({
  ...GoalInput.fields,
  startingDate: Schema.optionalKey(GoalInput.fields.startingDate),
  targetDate: Schema.optionalKey(GoalInput.fields.targetDate),
  notes: Schema.optionalKey(GoalInput.fields.notes),
})

export const GoalRevision = Schema.Struct({
  goalWeightLbs: Schema.optionalKey(GoalInput.fields.goalWeightLbs),
  startingWeightLbs: Schema.optionalKey(Goal.fields.startingWeightLbs),
  startingDate: Schema.optionalKey(GoalInput.fields.startingDate),
  targetDate: Schema.optionalKey(GoalInput.fields.targetDate),
  notes: Schema.optionalKey(GoalInput.fields.notes),
})
