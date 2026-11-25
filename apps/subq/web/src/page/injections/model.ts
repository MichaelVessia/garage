import { InjectionId, ScheduleId } from '@garage/subq-domain/Journal/Journal.id'
import { InjectionEntry } from '@garage/subq-domain/Journal/JournalRecords'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as Schema from 'effect/Schema'
import { taggedStruct } from 'foldkit/schema'

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

export const CompletedOpenInjectionForm = taggedStruct('CompletedOpenInjectionForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(InjectionEntry),
})

export const ClickedAddInjection = taggedStruct('ClickedAddInjection')

export const ClickedEditInjection = taggedStruct('ClickedEditInjection', { log: InjectionEntry })

export const ClickedCancelInjectionForm = taggedStruct('ClickedCancelInjectionForm')

export const ChangedInjectionDatetime = taggedStruct('ChangedInjectionDatetime', { value: Schema.String })

export const ChangedInjectionCompound = taggedStruct('ChangedInjectionCompound', { value: Schema.String })

export const ChangedInjectionSupplier = taggedStruct('ChangedInjectionSupplier', { value: Schema.String })

export const ChangedInjectionDoseMg = taggedStruct('ChangedInjectionDoseMg', { value: Schema.String })

export const ChangedInjectionSite = taggedStruct('ChangedInjectionSite', { value: Schema.String })

export const ChangedInjectionNotes = taggedStruct('ChangedInjectionNotes', { value: Schema.String })

export const ChangedInjectionSchedule = taggedStruct('ChangedInjectionSchedule', { value: Schema.String })

export const ConfirmedInjectionOffSchedule = taggedStruct('ConfirmedInjectionOffSchedule')

export const SubmittedInjectionForm = taggedStruct('SubmittedInjectionForm')

export const SucceededSaveInjection = taggedStruct('SucceededSaveInjection')

export const FailedSaveInjection = taggedStruct('FailedSaveInjection', { message: Schema.String })

export const RequestedDeleteInjection = taggedStruct('RequestedDeleteInjection', { id: InjectionId })

export const CancelledDeleteInjection = taggedStruct('CancelledDeleteInjection')

export const ConfirmedDeleteInjection = taggedStruct('ConfirmedDeleteInjection')

export const SucceededDeleteInjection = taggedStruct('SucceededDeleteInjection')

export const FailedDeleteInjection = taggedStruct('FailedDeleteInjection', { message: Schema.String })

export const ClickedInjectionSort = taggedStruct('ClickedInjectionSort', {
  column: Schema.Literals(['datetime', 'compound', 'doseMg']),
})

export const ClickedInjectionPage = taggedStruct('ClickedInjectionPage', { delta: Schema.Int })

export const ChangedInjectionAssignment = taggedStruct('ChangedInjectionAssignment', {
  injectionId: InjectionId,
  scheduleId: Schema.NullOr(ScheduleId),
})

export const SucceededInjectionAssignment = taggedStruct('SucceededInjectionAssignment')

export const InjectionsMessage = Schema.Union([
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
  ChangedInjectionAssignment,
  SucceededInjectionAssignment,
  ClickedInjectionSort,
  ClickedInjectionPage,
])

export type InjectionsMessage = typeof InjectionsMessage.Type

export type InjectionsPage = InjectionsModel & {
  readonly logs: ReadonlyArray<InjectionEntry>
  readonly sites: ReadonlyArray<string>
  readonly schedules: ReadonlyArray<Schedule>
}
