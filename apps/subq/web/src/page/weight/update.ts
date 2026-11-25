import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { WeightId } from '@garage/subq-domain/Journal/Journal.id'
import type { NewWeight } from '@garage/subq-domain/Journal/JournalRecords'
import { Notes, WeightLbs } from '@garage/subq-domain/Values'
import type { WeightUnit } from '@garage/subq-domain/Values'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import { modifyFields } from 'foldkit/struct'

import { client, mutate } from '../../client.ts'
import type { PageUpdate } from '../../client.ts'
import { fromLocalDatetimeString, utcToLocalDatetimeString } from '../../lib/datetime.ts'
import { withForm } from '../../lib/form.ts'
import { toStorageLbs, weightInputValue } from '../../lib/weight-unit.ts'
import { OpenWeightForm } from './command.ts'
import { FailedDeleteWeight, FailedSaveWeight, SucceededDeleteWeight, SucceededSaveWeight } from './model.ts'
import type { WeightMessage, WeightModel } from './model.ts'

type UpdateReturn = PageUpdate<WeightModel, WeightMessage>

const removeWeight = (weightId: WeightId) =>
  mutate(
    (request) => client.RemoveWeight({ ...request, input: { weightId } }),
    SucceededDeleteWeight(),
    (message) => FailedDeleteWeight({ message })
  )

const saveWeight = (id: Option.Option<WeightId>, input: typeof NewWeight.Type) =>
  mutate(
    (request) =>
      Option.isNone(id)
        ? client.RecordWeight({ ...request, input: { ...input, weightId: WeightId.make(request.commandId) } })
        : client.CorrectWeight({ ...request, input: { ...input, weightId: id.value } }),
    SucceededSaveWeight(),
    (message) => FailedSaveWeight({ message })
  )

export const updateWeight: {
  (message: WeightMessage, timezone: IanaTimezone, unit: WeightUnit): (model: WeightModel) => UpdateReturn
  (model: WeightModel, message: WeightMessage, timezone: IanaTimezone, unit: WeightUnit): UpdateReturn
} = Function.dual(
  4,
  (model: WeightModel, message: WeightMessage, timezone: IanaTimezone, unit: WeightUnit): UpdateReturn =>
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
          model.pendingDeleteId === null ? { model } : { model, mutation: removeWeight(model.pendingDeleteId) },
        FailedDeleteWeight: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
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
                    originalWeightLbs: null,
                    submitting: false,
                    weight: '',
                  }
                : {
                    datetime: utcToLocalDatetimeString(log.recordedAt, timezone),
                    editingId: log.id,
                    error: null,
                    maxDatetime: nowLocal,
                    notes: log.notes ?? '',
                    originalDatetime: log.recordedAt,
                    originalWeightLbs: log.weightLbs,
                    submitting: false,
                    weight: weightInputValue({ unit, lbs: log.weightLbs }),
                  },
            pendingDeleteId: () => null,
          }),
        }),
        RequestedDeleteWeight: ({ id }) => ({
          model: modifyFields(model, { form: () => null, pendingDeleteId: () => id }),
        }),
        SubmittedWeightForm: () => {
          if (model.form === null || model.form.submitting) {
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

          const { originalWeightLbs, weight } = model.form
          const parsed =
            originalWeightLbs !== null && weight === weightInputValue({ unit, lbs: originalWeightLbs })
              ? originalWeightLbs
              : toStorageLbs(unit, Number(weight))

          if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000) {
            return { model: withForm(model, () => ({ error: 'Enter a valid weight' })) }
          }

          return {
            model: withForm(model, () => ({ error: null, submitting: true })),
            mutation: saveWeight(Option.fromNullOr(model.form.editingId), {
              recordedAt: datetime.value,
              notes: model.form.notes === '' ? null : Notes.make(model.form.notes),
              weightLbs: WeightLbs.make(parsed),
            }),
          }
        },
        SucceededDeleteWeight: () => ({ model: { ...model, pendingDeleteId: null } }),
        SucceededSaveWeight: () => ({ model: { ...model, form: null } }),
      })
    )
)
