import * as Schema from 'effect/Schema'
import { AsyncData } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import { InjectionLog, InjectionLogId, InjectionSchedule } from '#shared'

// ============================================
// Model
// ============================================

export const InjectionLogsData = AsyncData.Schema(Schema.Array(InjectionLog), Schema.String).schema

export type InjectionLogsData = AsyncData.AsyncData<ReadonlyArray<InjectionLog>, string>

export const InjectionLookupData = AsyncData.Schema(Schema.Array(Schema.String), Schema.String).schema

export type InjectionLookupData = AsyncData.AsyncData<ReadonlyArray<string>, string>

export const InjectionSchedulesData = AsyncData.Schema(Schema.Array(InjectionSchedule), Schema.String).schema

export type InjectionSchedulesData = AsyncData.AsyncData<ReadonlyArray<InjectionSchedule>, string>

export const InjectionForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionLogId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  originalDatetime: Schema.NullOr(Schema.DateTimeUtc),
  drug: Schema.String,
  supplier: Schema.String,
  doseMg: Schema.String,
  injectionSite: Schema.String,
  notes: Schema.String,
  scheduleId: Schema.String,
  confirmedOffSchedule: Schema.Boolean,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type InjectionForm = typeof InjectionForm.Type

export const InjectionsModel = Schema.Struct({
  logs: InjectionLogsData,
  sites: InjectionLookupData,
  schedules: InjectionSchedulesData,
  form: Schema.NullOr(InjectionForm),
  pendingDeleteId: Schema.NullOr(InjectionLogId),
  sortColumn: Schema.Literals(['datetime', 'drug', 'doseMg']),
  sortDesc: Schema.Boolean,
  page: Schema.Int,
})

export type InjectionsModel = typeof InjectionsModel.Type

export const initialInjectionsModel: InjectionsModel = {
  form: null,
  logs: AsyncData.Idle(),
  page: 0,
  pendingDeleteId: null,
  schedules: AsyncData.Idle(),
  sites: AsyncData.Idle(),
  sortColumn: 'datetime',
  sortDesc: true,
}

// ============================================
// Messages
// ============================================

export const SucceededFetchInjectionLogs = taggedStruct('SucceededFetchInjectionLogs', {
  logs: Schema.Array(InjectionLog),
})

export const FailedFetchInjectionLogs = taggedStruct('FailedFetchInjectionLogs', {
  message: Schema.String,
})

export const SucceededFetchInjectionSites = taggedStruct('SucceededFetchInjectionSites', {
  sites: Schema.Array(Schema.String),
})

export const FailedFetchInjectionSites = taggedStruct('FailedFetchInjectionSites', {
  message: Schema.String,
})

export const SucceededFetchInjectionSchedules = taggedStruct('SucceededFetchInjectionSchedules', {
  schedules: Schema.Array(InjectionSchedule),
})

export const FailedFetchInjectionSchedules = taggedStruct('FailedFetchInjectionSchedules', {
  message: Schema.String,
})

export const CompletedOpenInjectionForm = taggedStruct('CompletedOpenInjectionForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(InjectionLog),
})

export const ClickedAddInjection = taggedStruct('ClickedAddInjection')
export const ClickedEditInjection = taggedStruct('ClickedEditInjection', { log: InjectionLog })
export const ClickedCancelInjectionForm = taggedStruct('ClickedCancelInjectionForm')
export const ChangedInjectionDatetime = taggedStruct('ChangedInjectionDatetime', { value: Schema.String })
export const ChangedInjectionDrug = taggedStruct('ChangedInjectionDrug', { value: Schema.String })
export const ChangedInjectionSupplier = taggedStruct('ChangedInjectionSupplier', { value: Schema.String })
export const ChangedInjectionDoseMg = taggedStruct('ChangedInjectionDoseMg', { value: Schema.String })
export const ChangedInjectionSite = taggedStruct('ChangedInjectionSite', { value: Schema.String })
export const ChangedInjectionNotes = taggedStruct('ChangedInjectionNotes', { value: Schema.String })
export const ChangedInjectionSchedule = taggedStruct('ChangedInjectionSchedule', { value: Schema.String })
export const ConfirmedInjectionOffSchedule = taggedStruct('ConfirmedInjectionOffSchedule')
export const SubmittedInjectionForm = taggedStruct('SubmittedInjectionForm')
export const SucceededSaveInjection = taggedStruct('SucceededSaveInjection')
export const FailedSaveInjection = taggedStruct('FailedSaveInjection', { message: Schema.String })
export const RequestedDeleteInjection = taggedStruct('RequestedDeleteInjection', { id: InjectionLogId })
export const CancelledDeleteInjection = taggedStruct('CancelledDeleteInjection')
export const ConfirmedDeleteInjection = taggedStruct('ConfirmedDeleteInjection')
export const SucceededDeleteInjection = taggedStruct('SucceededDeleteInjection')
export const FailedDeleteInjection = taggedStruct('FailedDeleteInjection', { message: Schema.String })

export const ClickedInjectionSort = taggedStruct('ClickedInjectionSort', {
  column: Schema.Literals(['datetime', 'drug', 'doseMg']),
})

export const ClickedInjectionPage = taggedStruct('ClickedInjectionPage', { delta: Schema.Int })

export const InjectionsMessage = Schema.Union([
  SucceededFetchInjectionLogs,
  FailedFetchInjectionLogs,
  SucceededFetchInjectionSites,
  FailedFetchInjectionSites,
  SucceededFetchInjectionSchedules,
  FailedFetchInjectionSchedules,
  CompletedOpenInjectionForm,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedCancelInjectionForm,
  ChangedInjectionDatetime,
  ChangedInjectionDrug,
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
])

export type InjectionsMessage = typeof InjectionsMessage.Type
