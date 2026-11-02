import * as Schema from 'effect/Schema'
import { AsyncData } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import { WeightLog, WeightLogId } from '#shared'

// ============================================
// Model
// ============================================

export const WeightLogsData = AsyncData.Schema(Schema.Array(WeightLog), Schema.String).schema

export type WeightLogsData = AsyncData.AsyncData<ReadonlyArray<WeightLog>, string>

export const WeightForm = Schema.Struct({
  editingId: Schema.NullOr(WeightLogId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  originalDatetime: Schema.NullOr(Schema.DateTimeUtc),
  weight: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type WeightForm = typeof WeightForm.Type

export const WeightModel = Schema.Struct({
  logs: WeightLogsData,
  form: Schema.NullOr(WeightForm),
  pendingDeleteId: Schema.NullOr(WeightLogId),
  sortColumn: Schema.Literals(['datetime', 'weight']),
  sortDesc: Schema.Boolean,
  page: Schema.Int,
})

export type WeightModel = typeof WeightModel.Type

export const initialWeightModel: WeightModel = {
  form: null,
  logs: AsyncData.Idle(),
  page: 0,
  pendingDeleteId: null,
  sortColumn: 'datetime',
  sortDesc: true,
}

// ============================================
// Messages
// ============================================

export const SucceededFetchWeightLogs = taggedStruct('SucceededFetchWeightLogs', {
  logs: Schema.Array(WeightLog),
})

export const FailedFetchWeightLogs = taggedStruct('FailedFetchWeightLogs', { message: Schema.String })

export const CompletedOpenWeightForm = taggedStruct('CompletedOpenWeightForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(WeightLog),
})

export const ClickedAddWeight = taggedStruct('ClickedAddWeight')
export const ClickedEditWeight = taggedStruct('ClickedEditWeight', { log: WeightLog })
export const ClickedCancelWeightForm = taggedStruct('ClickedCancelWeightForm')
export const ChangedWeightDatetime = taggedStruct('ChangedWeightDatetime', { value: Schema.String })
export const ChangedWeightValue = taggedStruct('ChangedWeightValue', { value: Schema.String })
export const ChangedWeightNotes = taggedStruct('ChangedWeightNotes', { value: Schema.String })

export const SubmittedWeightForm = taggedStruct('SubmittedWeightForm', {
  unit: Schema.Literals(['lbs', 'kg']),
})

export const SucceededSaveWeight = taggedStruct('SucceededSaveWeight')
export const FailedSaveWeight = taggedStruct('FailedSaveWeight', { message: Schema.String })
export const RequestedDeleteWeight = taggedStruct('RequestedDeleteWeight', { id: WeightLogId })
export const CancelledDeleteWeight = taggedStruct('CancelledDeleteWeight')
export const ConfirmedDeleteWeight = taggedStruct('ConfirmedDeleteWeight')
export const SucceededDeleteWeight = taggedStruct('SucceededDeleteWeight')
export const FailedDeleteWeight = taggedStruct('FailedDeleteWeight', { message: Schema.String })

export const ClickedWeightSort = taggedStruct('ClickedWeightSort', {
  column: Schema.Literals(['datetime', 'weight']),
})

export const ClickedWeightPage = taggedStruct('ClickedWeightPage', { delta: Schema.Int })

export const WeightMessage = Schema.Union([
  SucceededFetchWeightLogs,
  FailedFetchWeightLogs,
  CompletedOpenWeightForm,
  ClickedAddWeight,
  ClickedEditWeight,
  ClickedCancelWeightForm,
  ChangedWeightDatetime,
  ChangedWeightValue,
  ChangedWeightNotes,
  SubmittedWeightForm,
  SucceededSaveWeight,
  FailedSaveWeight,
  RequestedDeleteWeight,
  CancelledDeleteWeight,
  ConfirmedDeleteWeight,
  SucceededDeleteWeight,
  FailedDeleteWeight,
  ClickedWeightSort,
  ClickedWeightPage,
])

export type WeightMessage = typeof WeightMessage.Type
