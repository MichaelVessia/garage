import * as Schema from 'effect/Schema'

export const JournalId = Schema.Literal('personal').pipe(Schema.brand('JournalId'))
export type JournalId = typeof JournalId.Type

export const WeightId = Schema.NonEmptyString.pipe(Schema.brand('WeightId'))
export type WeightId = typeof WeightId.Type

export const InjectionId = Schema.NonEmptyString.pipe(Schema.brand('InjectionId'))
export type InjectionId = typeof InjectionId.Type

export const ScheduleId = Schema.NonEmptyString.pipe(Schema.brand('ScheduleId'))
export type ScheduleId = typeof ScheduleId.Type

export const SchedulePhaseId = Schema.NonEmptyString.pipe(Schema.brand('SchedulePhaseId'))
export type SchedulePhaseId = typeof SchedulePhaseId.Type

export const GoalId = Schema.NonEmptyString.pipe(Schema.brand('GoalId'))
export type GoalId = typeof GoalId.Type

export const PERSONAL_JOURNAL_ID = JournalId.make('personal')
