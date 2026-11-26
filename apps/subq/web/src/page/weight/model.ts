import { UiSchema } from '@effect/ui'
import { WeightId } from '@garage/subq-domain/Journal/Journal.id'
import { WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import { WeightLbs } from '@garage/subq-domain/Values'
import * as Schema from 'effect/Schema'

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

export const WeightMessage = UiSchema.TaggedEnum({
  CompletedOpenWeightForm: {
    nowLocal: Schema.String,
    log: Schema.NullOr(WeightEntry),
  },
  ClickedAddWeight: {},
  ClickedEditWeight: { log: WeightEntry },
  ClickedCancelWeightForm: {},
  ChangedWeightDatetime: { value: Schema.String },
  ChangedWeightValue: { value: Schema.String },
  ChangedWeightNotes: { value: Schema.String },
  SubmittedWeightForm: {},
  SucceededSaveWeight: {},
  FailedSaveWeight: { message: Schema.String },
  RequestedDeleteWeight: { id: WeightId },
  CancelledDeleteWeight: {},
  ConfirmedDeleteWeight: {},
  SucceededDeleteWeight: {},
  FailedDeleteWeight: { message: Schema.String },
  ClickedWeightSort: {
    column: Schema.Literals(['datetime', 'weight']),
  },
  ClickedWeightPage: { delta: Schema.Int },
})

export const {
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
} = WeightMessage

export type WeightMessage = typeof WeightMessage.Type

export type WeightPage = WeightModel & {
  readonly logs: ReadonlyArray<WeightEntry>
}
