import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import { AsyncData } from 'foldkit'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import type { IanaTimezone } from '#shared'

import type { Api } from '../../api.js'
import { toStorageLbs } from '../../data/settings.js'
import { fromLocalDatetimeString, utcToLocalDatetimeString } from '../../lib/datetime.js'
import { withForm } from '../../lib/form.js'
import { DeleteWeight, FetchWeightLogs, OpenWeightForm, SaveWeight } from './command.js'
import type {
  CompletedOpenWeightForm,
  FailedDeleteWeight,
  FailedFetchWeightLogs,
  FailedSaveWeight,
  SucceededDeleteWeight,
  SucceededFetchWeightLogs,
  SucceededSaveWeight,
  WeightMessage,
  WeightModel,
} from './model.js'

// ============================================
// Update
// ============================================

type WeightCommandMessage =
  | typeof SucceededFetchWeightLogs.Type
  | typeof FailedFetchWeightLogs.Type
  | typeof CompletedOpenWeightForm.Type
  | typeof SucceededSaveWeight.Type
  | typeof FailedSaveWeight.Type
  | typeof SucceededDeleteWeight.Type
  | typeof FailedDeleteWeight.Type

type UpdateReturn = Update.Return<WeightModel, WeightCommandMessage, Api>

export const fetchWeightLogsIfIdle = (model: WeightModel): UpdateReturn =>
  AsyncData.isIdle(model.logs)
    ? { model: modifyFields(model, { logs: () => AsyncData.Loading() }), commands: [FetchWeightLogs()] }
    : { model }

export const updateWeight: {
  (message: WeightMessage, timezone: IanaTimezone): (model: WeightModel) => UpdateReturn
  (model: WeightModel, message: WeightMessage, timezone: IanaTimezone): UpdateReturn
} = Function.dual(3, (model: WeightModel, message: WeightMessage, timezone: IanaTimezone): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteWeight: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      ChangedWeightDatetime: ({ value }) => ({ model: withForm(model, () => ({ datetime: value })) }),
      ChangedWeightNotes: ({ value }) => ({ model: withForm(model, () => ({ notes: value })) }),
      ChangedWeightValue: ({ value }) => ({ model: withForm(model, () => ({ weight: value })) }),
      ClickedAddWeight: () => ({ model, commands: [OpenWeightForm({ log: null, timezone })] }),
      ClickedCancelWeightForm: () => ({ model: modifyFields(model, { form: () => null }) }),
      ClickedEditWeight: ({ log }) => ({ model, commands: [OpenWeightForm({ log, timezone })] }),
      ClickedWeightPage: ({ delta }) => ({ model: modifyFields(model, { page: (page) => page + delta }) }),
      ClickedWeightSort: ({ column }) => ({
        model: modifyFields(model, {
          page: () => 0,
          sortColumn: () => column,
          sortDesc: (desc) => (model.sortColumn === column ? !desc : true),
        }),
      }),
      ConfirmedDeleteWeight: () =>
        model.pendingDeleteId === null ? { model } : { model, commands: [DeleteWeight({ id: model.pendingDeleteId })] },
      FailedDeleteWeight: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      FailedFetchWeightLogs: ({ message: error }) => ({
        model: modifyFields(model, { logs: () => AsyncData.Failure({ error }) }),
      }),
      FailedSaveWeight: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
      CompletedOpenWeightForm: ({ log, nowLocal }) => ({
        model: modifyFields(model, {
          form: () =>
            log === null
              ? {
                  datetime: nowLocal,
                  editingId: null,
                  error: null,
                  maxDatetime: nowLocal,
                  notes: '',
                  originalDatetime: null,
                  submitting: false,
                  weight: '',
                }
              : {
                  datetime: utcToLocalDatetimeString(log.datetime, timezone),
                  editingId: log.id,
                  error: null,
                  maxDatetime: nowLocal,
                  notes: log.notes ?? '',
                  originalDatetime: log.datetime,
                  submitting: false,
                  weight: String(log.weight),
                },
          pendingDeleteId: () => null,
        }),
      }),
      RequestedDeleteWeight: ({ id }) => ({
        model: modifyFields(model, { form: () => null, pendingDeleteId: () => id }),
      }),
      SubmittedWeightForm: ({ unit }) => {
        if (model.form === null) {
          return { model }
        }

        const datetime =
          model.form.originalDatetime !== null &&
          model.form.datetime === utcToLocalDatetimeString(model.form.originalDatetime, timezone)
            ? Option.some(model.form.originalDatetime)
            : fromLocalDatetimeString(model.form.datetime, timezone)

        if (Option.isNone(datetime)) {
          return { model: withForm(model, () => ({ error: 'Date & time is invalid in your timezone' })) }
        }

        // The number input yields a decimal string or '', so Number matches the
        // previous parseFloat result; '' becomes 0 and fails the range check.
        const parsed = Number(model.form.weight)

        if (Number.isNaN(parsed) || parsed <= 0 || parsed > 1000) {
          return { model: withForm(model, () => ({ error: 'Enter a valid weight' })) }
        }

        return {
          model: withForm(model, () => ({ error: null, submitting: true })),
          commands: [
            SaveWeight({
              datetime: datetime.value,
              editingId: model.form.editingId,
              notes: model.form.notes,
              weightLbs: toStorageLbs(unit, parsed),
            }),
          ],
        }
      },
      SucceededDeleteWeight: () => ({
        model: modifyFields(model, { logs: () => AsyncData.Loading(), pendingDeleteId: () => null }),
        commands: [FetchWeightLogs()],
      }),
      SucceededFetchWeightLogs: ({ logs }) => ({ model: modifyFields(model, { logs: () => AsyncData.succeed(logs) }) }),
      SucceededSaveWeight: () => ({
        model: modifyFields(model, { form: () => null, logs: () => AsyncData.Loading() }),
        commands: [FetchWeightLogs()],
      }),
    })
  )
)
