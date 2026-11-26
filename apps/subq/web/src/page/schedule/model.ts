import { UiSchema } from '@effect/ui'
import { ScheduleId, SchedulePhaseId } from '@garage/subq-domain/Journal/Journal.id'
import { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import type { NextScheduledDose } from '@garage/subq-domain/ScheduleMath'
import { Frequency } from '@garage/subq-domain/Values'
import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

// ============================================
// Model
// ============================================

export const SchedulePhaseForm = Schema.Struct({
  id: Schema.NullOr(SchedulePhaseId),
  order: Schema.Int,
  durationDays: Schema.String,
  doseMg: Schema.String,
  isIndefinite: Schema.Boolean,
})

export type SchedulePhaseForm = typeof SchedulePhaseForm.Type

export const ScheduleForm = Schema.Struct({
  editingId: Schema.NullOr(ScheduleId),
  name: Schema.String,
  compound: Schema.String,
  supplier: Schema.String,
  frequency: Frequency,
  startDate: Schema.String,
  notes: Schema.String,
  phases: Schema.Array(SchedulePhaseForm),
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type ScheduleForm = typeof ScheduleForm.Type

export const ScheduleModel = Schema.Struct({
  form: Schema.NullOr(ScheduleForm),
  pendingDeleteId: Schema.NullOr(ScheduleId),
})

export type ScheduleModel = typeof ScheduleModel.Type

export const initialScheduleModel: ScheduleModel = {
  form: null,
  pendingDeleteId: null,
}

// ============================================
// Messages
// ============================================

export const ScheduleMessage = UiSchema.TaggedEnum({
  CompletedOpenScheduleForm: {
    todayLocal: Schema.String,
    schedule: Schema.NullOr(Schedule),
  },
  ClickedAddSchedule: {},
  ClickedEditSchedule: { schedule: Schedule },
  ClickedCancelScheduleForm: {},
  ChangedScheduleName: { value: Schema.String },
  ChangedScheduleCompound: { value: Schema.String },
  ChangedScheduleSupplier: { value: Schema.String },
  ChangedScheduleFrequency: { value: Frequency },
  ChangedScheduleStartDate: { value: Schema.String },
  ChangedScheduleNotes: { value: Schema.String },
  AddedSchedulePhase: {},
  RemovedSchedulePhase: { index: Schema.Int },
  ChangedSchedulePhaseDoseMg: {
    index: Schema.Int,
    value: Schema.String,
  },
  ChangedSchedulePhaseDuration: {
    index: Schema.Int,
    value: Schema.String,
  },
  ToggledSchedulePhaseIndefinite: {
    index: Schema.Int,
    checked: Schema.Boolean,
  },
  SubmittedScheduleForm: {},
  SucceededSaveSchedule: {},
  FailedSaveSchedule: { message: Schema.String },
  RequestedDeleteSchedule: { id: ScheduleId },
  CancelledDeleteSchedule: {},
  ConfirmedDeleteSchedule: {},
  SucceededDeleteSchedule: {},
  FailedDeleteSchedule: { message: Schema.String },
  ClickedToggleScheduleActivity: { schedule: Schedule },
  SucceededActivateSchedule: {},
  FailedActivateSchedule: { message: Schema.String },
})

export const {
  CompletedOpenScheduleForm,
  ClickedAddSchedule,
  ClickedEditSchedule,
  ClickedCancelScheduleForm,
  ChangedScheduleName,
  ChangedScheduleCompound,
  ChangedScheduleSupplier,
  ChangedScheduleFrequency,
  ChangedScheduleStartDate,
  ChangedScheduleNotes,
  AddedSchedulePhase,
  RemovedSchedulePhase,
  ChangedSchedulePhaseDoseMg,
  ChangedSchedulePhaseDuration,
  ToggledSchedulePhaseIndefinite,
  SubmittedScheduleForm,
  SucceededSaveSchedule,
  FailedSaveSchedule,
  RequestedDeleteSchedule,
  CancelledDeleteSchedule,
  ConfirmedDeleteSchedule,
  SucceededDeleteSchedule,
  FailedDeleteSchedule,
  ClickedToggleScheduleActivity,
  SucceededActivateSchedule,
  FailedActivateSchedule,
} = ScheduleMessage

export type ScheduleMessage = typeof ScheduleMessage.Type

export type SchedulePage = ScheduleModel & {
  readonly schedules: ReadonlyArray<Schedule>
  readonly nextDose: Option.Option<NextScheduledDose>
}
