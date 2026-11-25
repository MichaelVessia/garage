import { ScheduleId, SchedulePhaseId } from '@garage/subq-domain/Journal/Journal.id'
import { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import type { NextScheduledDose } from '@garage/subq-domain/ScheduleMath'
import { Frequency } from '@garage/subq-domain/Values'
import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { taggedStruct } from 'foldkit/schema'

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

export const CompletedOpenScheduleForm = taggedStruct('CompletedOpenScheduleForm', {
  todayLocal: Schema.String,
  schedule: Schema.NullOr(Schedule),
})

export const ClickedAddSchedule = taggedStruct('ClickedAddSchedule')

export const ClickedEditSchedule = taggedStruct('ClickedEditSchedule', { schedule: Schedule })

export const ClickedCancelScheduleForm = taggedStruct('ClickedCancelScheduleForm')

export const ChangedScheduleName = taggedStruct('ChangedScheduleName', { value: Schema.String })

export const ChangedScheduleCompound = taggedStruct('ChangedScheduleCompound', { value: Schema.String })

export const ChangedScheduleSupplier = taggedStruct('ChangedScheduleSupplier', { value: Schema.String })

export const ChangedScheduleFrequency = taggedStruct('ChangedScheduleFrequency', { value: Frequency })

export const ChangedScheduleStartDate = taggedStruct('ChangedScheduleStartDate', { value: Schema.String })

export const ChangedScheduleNotes = taggedStruct('ChangedScheduleNotes', { value: Schema.String })

export const AddedSchedulePhase = taggedStruct('AddedSchedulePhase')

export const RemovedSchedulePhase = taggedStruct('RemovedSchedulePhase', { index: Schema.Int })

export const ChangedSchedulePhaseDoseMg = taggedStruct('ChangedSchedulePhaseDoseMg', {
  index: Schema.Int,
  value: Schema.String,
})

export const ChangedSchedulePhaseDuration = taggedStruct('ChangedSchedulePhaseDuration', {
  index: Schema.Int,
  value: Schema.String,
})

export const ToggledSchedulePhaseIndefinite = taggedStruct('ToggledSchedulePhaseIndefinite', {
  index: Schema.Int,
  checked: Schema.Boolean,
})

export const SubmittedScheduleForm = taggedStruct('SubmittedScheduleForm')

export const SucceededSaveSchedule = taggedStruct('SucceededSaveSchedule')

export const FailedSaveSchedule = taggedStruct('FailedSaveSchedule', { message: Schema.String })

export const RequestedDeleteSchedule = taggedStruct('RequestedDeleteSchedule', { id: ScheduleId })

export const CancelledDeleteSchedule = taggedStruct('CancelledDeleteSchedule')

export const ConfirmedDeleteSchedule = taggedStruct('ConfirmedDeleteSchedule')

export const SucceededDeleteSchedule = taggedStruct('SucceededDeleteSchedule')

export const FailedDeleteSchedule = taggedStruct('FailedDeleteSchedule', { message: Schema.String })

export const ClickedToggleScheduleActivity = taggedStruct('ClickedToggleScheduleActivity', { schedule: Schedule })

export const SucceededActivateSchedule = taggedStruct('SucceededActivateSchedule')

export const FailedActivateSchedule = taggedStruct('FailedActivateSchedule', { message: Schema.String })

export const ScheduleMessage = Schema.Union([
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
])

export type ScheduleMessage = typeof ScheduleMessage.Type

export type SchedulePage = ScheduleModel & {
  readonly schedules: ReadonlyArray<Schedule>
  readonly nextDose: Option.Option<NextScheduledDose>
}
