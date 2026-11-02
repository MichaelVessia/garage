import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import { AsyncData } from 'foldkit'
import type { Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import type { IanaTimezone } from '#shared'

import type { Api } from '../../api.js'
import { fromLocalDatetimeString, utcToLocalDatetimeString } from '../../lib/datetime.js'
import { withForm } from '../../lib/form.js'
import {
  DeleteInjection,
  FetchInjectionLogs,
  FetchInjectionSchedules,
  FetchInjectionSites,
  OpenInjectionForm,
  SaveInjection,
} from './command.js'
import type { InjectionCommandMessage } from './command.js'
import { isOffScheduleDose, validateForm } from './form.js'
import type { InjectionsMessage, InjectionsModel } from './model.js'

// ============================================
// Update
// ============================================

type UpdateReturn = Update.Return<InjectionsModel, InjectionCommandMessage, Api>

export const fetchInjectionsIfIdle = (model: InjectionsModel): UpdateReturn => {
  const commands: Array<Command.Command<InjectionCommandMessage, never, Api>> = []
  let next = model

  if (AsyncData.isIdle(next.logs)) {
    next = modifyFields(next, { logs: () => AsyncData.Loading() })
    commands.push(FetchInjectionLogs())
  }

  if (AsyncData.isIdle(next.sites)) {
    next = modifyFields(next, { sites: () => AsyncData.Loading() })
    commands.push(FetchInjectionSites())
  }

  if (AsyncData.isIdle(next.schedules)) {
    next = modifyFields(next, { schedules: () => AsyncData.Loading() })
    commands.push(FetchInjectionSchedules())
  }

  return { model: next, commands }
}

export const updateInjections: {
  (message: InjectionsMessage, timezone: IanaTimezone): (model: InjectionsModel) => UpdateReturn
  (model: InjectionsModel, message: InjectionsMessage, timezone: IanaTimezone): UpdateReturn
} = Function.dual(3, (model: InjectionsModel, message: InjectionsMessage, timezone: IanaTimezone): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteInjection: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      ChangedInjectionDatetime: ({ value }) => ({ model: withForm(model, () => ({ datetime: value })) }),
      ChangedInjectionDoseMg: ({ value }) => ({
        model: withForm(model, () => ({ confirmedOffSchedule: false, doseMg: value })),
      }),
      ChangedInjectionDrug: ({ value }) => ({
        model: withForm(model, () => ({ confirmedOffSchedule: false, drug: value, scheduleId: '' })),
      }),
      ChangedInjectionNotes: ({ value }) => ({ model: withForm(model, () => ({ notes: value })) }),
      ChangedInjectionSchedule: ({ value }) => ({
        model: withForm(model, () => ({ confirmedOffSchedule: false, scheduleId: value })),
      }),
      ChangedInjectionSite: ({ value }) => ({ model: withForm(model, () => ({ injectionSite: value })) }),
      ChangedInjectionSupplier: ({ value }) => ({ model: withForm(model, () => ({ supplier: value })) }),
      ClickedAddInjection: () => ({ model, commands: [OpenInjectionForm({ log: null, timezone })] }),
      ClickedCancelInjectionForm: () => ({ model: modifyFields(model, { form: () => null }) }),
      ClickedEditInjection: ({ log }) => ({ model, commands: [OpenInjectionForm({ log, timezone })] }),
      ClickedInjectionPage: ({ delta }) => ({ model: modifyFields(model, { page: (page) => page + delta }) }),
      ClickedInjectionSort: ({ column }) => ({
        model: modifyFields(model, {
          page: () => 0,
          sortColumn: () => column,
          sortDesc: (desc) => (model.sortColumn === column ? !desc : true),
        }),
      }),
      ConfirmedDeleteInjection: () =>
        model.pendingDeleteId === null
          ? { model }
          : { model, commands: [DeleteInjection({ id: model.pendingDeleteId })] },
      ConfirmedInjectionOffSchedule: () => ({ model: withForm(model, () => ({ confirmedOffSchedule: true })) }),
      FailedDeleteInjection: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      FailedFetchInjectionLogs: ({ message: error }) => ({
        model: modifyFields(model, { logs: () => AsyncData.Failure({ error }) }),
      }),
      FailedFetchInjectionSchedules: ({ message: error }) => ({
        model: modifyFields(model, { schedules: () => AsyncData.Failure({ error }) }),
      }),
      FailedFetchInjectionSites: ({ message: error }) => ({
        model: modifyFields(model, { sites: () => AsyncData.Failure({ error }) }),
      }),
      FailedSaveInjection: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
      CompletedOpenInjectionForm: ({ log, nowLocal }) => ({
        model: modifyFields(model, {
          form: () =>
            log === null
              ? {
                  confirmedOffSchedule: false,
                  datetime: nowLocal,
                  doseMg: '',
                  drug: '',
                  editingId: null,
                  error: null,
                  injectionSite: '',
                  maxDatetime: nowLocal,
                  notes: '',
                  originalDatetime: null,
                  scheduleId: '',
                  supplier: '',
                  submitting: false,
                }
              : {
                  confirmedOffSchedule: false,
                  datetime: utcToLocalDatetimeString(log.datetime, timezone),
                  doseMg: String(log.doseMg),
                  drug: log.drug,
                  editingId: log.id,
                  error: null,
                  injectionSite: log.injectionSite ?? '',
                  maxDatetime: nowLocal,
                  notes: log.notes ?? '',
                  originalDatetime: log.datetime,
                  scheduleId: log.scheduleId ?? '',
                  supplier: log.supplier ?? '',
                  submitting: false,
                },
          pendingDeleteId: () => null,
        }),
      }),
      RequestedDeleteInjection: ({ id }) => ({
        model: modifyFields(model, { form: () => null, pendingDeleteId: () => id }),
      }),
      SubmittedInjectionForm: () => {
        if (model.form === null) {
          return { model }
        }

        const validationError = validateForm(model.form)

        if (Option.isSome(validationError)) {
          const errorMessage = validationError.value

          return { model: withForm(model, () => ({ error: errorMessage, submitting: false })) }
        }

        const datetime =
          model.form.originalDatetime !== null &&
          model.form.datetime === utcToLocalDatetimeString(model.form.originalDatetime, timezone)
            ? Option.some(model.form.originalDatetime)
            : fromLocalDatetimeString(model.form.datetime, timezone)

        if (Option.isNone(datetime)) {
          return {
            model: withForm(model, () => ({ error: 'Date & time is invalid in your timezone', submitting: false })),
          }
        }

        const schedules = AsyncData.getOrElse(model.schedules, () => [])

        if (isOffScheduleDose(model.form, schedules) && !model.form.confirmedOffSchedule) {
          return {
            model: withForm(model, () => ({ error: 'Confirm the off-schedule dose before saving', submitting: false })),
          }
        }

        return {
          model: withForm(model, () => ({ error: null, submitting: true })),
          commands: [
            SaveInjection({
              datetime: datetime.value,
              doseMg: Str.trim(model.form.doseMg),
              drug: Str.trim(model.form.drug),
              editingId: model.form.editingId,
              injectionSite: Str.trim(model.form.injectionSite),
              notes: Str.trim(model.form.notes),
              scheduleId: model.form.scheduleId,
              supplier: Str.trim(model.form.supplier),
            }),
          ],
        }
      },
      SucceededDeleteInjection: () => ({
        model: modifyFields(model, { logs: () => AsyncData.Loading(), pendingDeleteId: () => null }),
        commands: [FetchInjectionLogs()],
      }),
      SucceededFetchInjectionLogs: ({ logs }) => ({
        model: modifyFields(model, { logs: () => AsyncData.succeed(logs) }),
      }),
      SucceededFetchInjectionSchedules: ({ schedules }) => ({
        model: modifyFields(model, { schedules: () => AsyncData.succeed(schedules) }),
      }),
      SucceededFetchInjectionSites: ({ sites }) => ({
        model: modifyFields(model, { sites: () => AsyncData.succeed(sites) }),
      }),
      SucceededSaveInjection: () => ({
        model: modifyFields(model, {
          form: () => null,
          logs: () => AsyncData.Loading(),
          sites: () => AsyncData.Loading(),
        }),
        commands: [FetchInjectionLogs(), FetchInjectionSites()],
      }),
    })
  )
)
