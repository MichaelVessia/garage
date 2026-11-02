import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { AsyncData } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import { Frequency, IanaTimezone, InjectionSchedule, InjectionScheduleId, NextScheduledDose } from '#shared'

// ============================================
// Model
// ============================================

export const SchedulesData = AsyncData.Schema(Schema.Array(InjectionSchedule), Schema.String).schema

export type SchedulesData = AsyncData.AsyncData<ReadonlyArray<InjectionSchedule>, string>

export const NextDoseData = AsyncData.Schema(Schema.OptionFromNullOr(NextScheduledDose), Schema.String).schema

export type NextDoseData = AsyncData.AsyncData<Option.Option<NextScheduledDose>, string>

export const SchedulePhaseForm = Schema.Struct({
  order: Schema.Int,
  durationDays: Schema.String,
  doseMg: Schema.String,
  isIndefinite: Schema.Boolean,
})

export type SchedulePhaseForm = typeof SchedulePhaseForm.Type

export const ScheduleForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionScheduleId),
  name: Schema.String,
  drug: Schema.String,
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
  schedules: SchedulesData,
  nextDose: NextDoseData,
  nextDoseRequestKey: Schema.Int,
  form: Schema.NullOr(ScheduleForm),
  pendingDeleteId: Schema.NullOr(InjectionScheduleId),
})

export type ScheduleModel = typeof ScheduleModel.Type

export const initialScheduleModel: ScheduleModel = {
  form: null,
  nextDose: AsyncData.Idle(),
  nextDoseRequestKey: 0,
  pendingDeleteId: null,
  schedules: AsyncData.Idle(),
}

// ============================================
// Messages
// ============================================

export const SucceededFetchSchedules = taggedStruct('SucceededFetchSchedules', {
  schedules: Schema.Array(InjectionSchedule),
})

export const FailedFetchSchedules = taggedStruct('FailedFetchSchedules', { message: Schema.String })

export const SucceededFetchNextDose = taggedStruct('SucceededFetchNextDose', {
  nextDose: Schema.NullOr(NextScheduledDose),
  requestKey: Schema.Int,
  requestedTimezone: IanaTimezone,
  timezone: IanaTimezone,
})

export const FailedFetchNextDose = taggedStruct('FailedFetchNextDose', {
  message: Schema.String,
  requestKey: Schema.Int,
  requestedTimezone: IanaTimezone,
})

export const CompletedOpenScheduleForm = taggedStruct('CompletedOpenScheduleForm', {
  todayLocal: Schema.String,
  schedule: Schema.NullOr(InjectionSchedule),
})

export const ClickedAddSchedule = taggedStruct('ClickedAddSchedule')
export const ClickedEditSchedule = taggedStruct('ClickedEditSchedule', { schedule: InjectionSchedule })
export const ClickedCancelScheduleForm = taggedStruct('ClickedCancelScheduleForm')
export const ChangedScheduleName = taggedStruct('ChangedScheduleName', { value: Schema.String })
export const ChangedScheduleDrug = taggedStruct('ChangedScheduleDrug', { value: Schema.String })
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
export const RequestedDeleteSchedule = taggedStruct('RequestedDeleteSchedule', { id: InjectionScheduleId })
export const CancelledDeleteSchedule = taggedStruct('CancelledDeleteSchedule')
export const ConfirmedDeleteSchedule = taggedStruct('ConfirmedDeleteSchedule')
export const SucceededDeleteSchedule = taggedStruct('SucceededDeleteSchedule')
export const FailedDeleteSchedule = taggedStruct('FailedDeleteSchedule', { message: Schema.String })
export const ClickedActivateSchedule = taggedStruct('ClickedActivateSchedule', { schedule: InjectionSchedule })
export const SucceededActivateSchedule = taggedStruct('SucceededActivateSchedule')
export const FailedActivateSchedule = taggedStruct('FailedActivateSchedule', { message: Schema.String })

export const ScheduleMessage = Schema.Union([
  SucceededFetchSchedules,
  FailedFetchSchedules,
  SucceededFetchNextDose,
  FailedFetchNextDose,
  CompletedOpenScheduleForm,
  ClickedAddSchedule,
  ClickedEditSchedule,
  ClickedCancelScheduleForm,
  ChangedScheduleName,
  ChangedScheduleDrug,
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
  ClickedActivateSchedule,
  SucceededActivateSchedule,
  FailedActivateSchedule,
])

export type ScheduleMessage = typeof ScheduleMessage.Type
