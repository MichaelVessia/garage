import { WeightId } from '@garage/subq-domain/Journal/Journal.id'
import { WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import { WeightLbs } from '@garage/subq-domain/Values'
import * as Schema from 'effect/Schema'
import { taggedStruct } from 'foldkit/schema'

// ============================================
// Model
// ============================================

export const WeightForm = Schema.Struct({
  editingId: Schema.NullOr(WeightId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  originalWeightLbs: Schema.NullOr(WeightLbs),
  originalDatetime: Schema.NullOr(Schema.DateTimeUtc),
  weight: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type WeightForm = typeof WeightForm.Type

export const WeightModel = Schema.Struct({
  form: Schema.NullOr(WeightForm),
  pendingDeleteId: Schema.NullOr(WeightId),
  sortColumn: Schema.Literals(['datetime', 'weight']),
  sortDesc: Schema.Boolean,
  page: Schema.Int,
})

export type WeightModel = typeof WeightModel.Type

export const initialWeightModel: WeightModel = {
  form: null,
  page: 0,
  pendingDeleteId: null,
  sortColumn: 'datetime',
  sortDesc: true,
}

// ============================================
// Messages
// ============================================

export const CompletedOpenWeightForm = taggedStruct('CompletedOpenWeightForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(WeightEntry),
})

export const ClickedAddWeight = taggedStruct('ClickedAddWeight')

export const ClickedEditWeight = taggedStruct('ClickedEditWeight', { log: WeightEntry })

export const ClickedCancelWeightForm = taggedStruct('ClickedCancelWeightForm')

export const ChangedWeightDatetime = taggedStruct('ChangedWeightDatetime', { value: Schema.String })

export const ChangedWeightValue = taggedStruct('ChangedWeightValue', { value: Schema.String })

export const ChangedWeightNotes = taggedStruct('ChangedWeightNotes', { value: Schema.String })

export const SubmittedWeightForm = taggedStruct('SubmittedWeightForm')

export const SucceededSaveWeight = taggedStruct('SucceededSaveWeight')

export const FailedSaveWeight = taggedStruct('FailedSaveWeight', { message: Schema.String })

export const RequestedDeleteWeight = taggedStruct('RequestedDeleteWeight', { id: WeightId })

export const CancelledDeleteWeight = taggedStruct('CancelledDeleteWeight')

export const ConfirmedDeleteWeight = taggedStruct('ConfirmedDeleteWeight')

export const SucceededDeleteWeight = taggedStruct('SucceededDeleteWeight')

export const FailedDeleteWeight = taggedStruct('FailedDeleteWeight', { message: Schema.String })

export const ClickedWeightSort = taggedStruct('ClickedWeightSort', {
  column: Schema.Literals(['datetime', 'weight']),
})

export const ClickedWeightPage = taggedStruct('ClickedWeightPage', { delta: Schema.Int })

export const WeightMessage = Schema.Union([
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

export type WeightPage = WeightModel & {
  readonly logs: ReadonlyArray<WeightEntry>
}
