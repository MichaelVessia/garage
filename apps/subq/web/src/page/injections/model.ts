import { UiSchema } from '@effect/ui'
import { InjectionId, ScheduleId } from '@garage/subq-domain/Journal/Journal.id'
import { InjectionEntry } from '@garage/subq-domain/Journal/JournalRecords'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as Schema from 'effect/Schema'

// ============================================
// Model
// ============================================

export const InjectionForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  originalDatetime: Schema.NullOr(Schema.DateTimeUtc),
  compound: Schema.String,
  supplier: Schema.String,
  doseMg: Schema.String,
  site: Schema.String,
  notes: Schema.String,
  scheduleId: Schema.String,
  confirmedOffSchedule: Schema.Boolean,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type InjectionForm = typeof InjectionForm.Type

export const InjectionsModel = Schema.Struct({
  form: Schema.NullOr(InjectionForm),
  pendingDeleteId: Schema.NullOr(InjectionId),
  sortColumn: Schema.Literals(['datetime', 'compound', 'doseMg']),
  sortDesc: Schema.Boolean,
  page: Schema.Int,
})

export type InjectionsModel = typeof InjectionsModel.Type

export const initialInjectionsModel: InjectionsModel = {
  form: null,
  page: 0,
  pendingDeleteId: null,
  sortColumn: 'datetime',
  sortDesc: true,
}

// ============================================
// Messages
// ============================================

export const InjectionsMessage = UiSchema.TaggedEnum({
  CompletedOpenInjectionForm: {
    nowLocal: Schema.String,
    log: Schema.NullOr(InjectionEntry),
  },
  ClickedAddInjection: {},
  ClickedEditInjection: { log: InjectionEntry },
  ClickedCancelInjectionForm: {},
  ChangedInjectionDatetime: { value: Schema.String },
  ChangedInjectionCompound: { value: Schema.String },
  ChangedInjectionSupplier: { value: Schema.String },
  ChangedInjectionDoseMg: { value: Schema.String },
  ChangedInjectionSite: { value: Schema.String },
  ChangedInjectionNotes: { value: Schema.String },
  ChangedInjectionSchedule: { value: Schema.String },
  ConfirmedInjectionOffSchedule: {},
  SubmittedInjectionForm: {},
  SucceededSaveInjection: {},
  FailedSaveInjection: { message: Schema.String },
  RequestedDeleteInjection: { id: InjectionId },
  CancelledDeleteInjection: {},
  ConfirmedDeleteInjection: {},
  SucceededDeleteInjection: {},
  FailedDeleteInjection: { message: Schema.String },
  ClickedInjectionSort: {
    column: Schema.Literals(['datetime', 'compound', 'doseMg']),
  },
  ClickedInjectionPage: { delta: Schema.Int },
  ChangedInjectionAssignment: {
    injectionId: InjectionId,
    scheduleId: Schema.NullOr(ScheduleId),
  },
  SucceededInjectionAssignment: {},
})

export const {
  CompletedOpenInjectionForm,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedCancelInjectionForm,
  ChangedInjectionDatetime,
  ChangedInjectionCompound,
  ChangedInjectionSupplier,
  ChangedInjectionDoseMg,
  ChangedInjectionSite,
  ChangedInjectionNotes,
  ChangedInjectionSchedule,
  ConfirmedInjectionOffSchedule,
  SubmittedInjectionForm,
  SucceededSaveInjection,
  FailedSaveInjection,
  RequestedDeleteInjection,
  CancelledDeleteInjection,
  ConfirmedDeleteInjection,
  SucceededDeleteInjection,
  FailedDeleteInjection,
  ClickedInjectionSort,
  ClickedInjectionPage,
  ChangedInjectionAssignment,
  SucceededInjectionAssignment,
} = InjectionsMessage

export type InjectionsMessage = typeof InjectionsMessage.Type

export type InjectionsPage = InjectionsModel & {
  readonly logs: ReadonlyArray<InjectionEntry>
  readonly sites: ReadonlyArray<string>
  readonly schedules: ReadonlyArray<Schedule>
}
