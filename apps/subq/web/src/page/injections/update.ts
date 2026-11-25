import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { InjectionId } from '@garage/subq-domain/Journal/Journal.id'
import { NewInjection } from '@garage/subq-domain/Journal/JournalRecords'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { modifyFields } from 'foldkit/struct'

import { client, mutate } from '../../client.ts'
import type { PageUpdate } from '../../client.ts'
import { fromLocalDatetimeString, utcToLocalDatetimeString } from '../../lib/datetime.ts'
import { optionalText, withForm } from '../../lib/form.ts'
import { OpenInjectionForm } from './command.ts'
import { isOffScheduleDose, validateForm } from './form.ts'
import {
  FailedDeleteInjection,
  FailedSaveInjection,
  SucceededDeleteInjection,
  SucceededInjectionAssignment,
  SucceededSaveInjection,
} from './model.ts'
import type { InjectionsMessage, InjectionsModel } from './model.ts'

type UpdateReturn = PageUpdate<InjectionsModel, InjectionsMessage>

const decodeInjection = Schema.decodeUnknownOption(Schema.toType(NewInjection))

const removeInjection = (injectionId: InjectionId) =>
  mutate(
    (request) => client.RemoveInjection({ ...request, input: { injectionId } }),
    SucceededDeleteInjection(),
    (message) => FailedDeleteInjection({ message })
  )

const saveInjection = (id: Option.Option<InjectionId>, input: typeof NewInjection.Type) =>
  mutate(
    (request) =>
      Option.isNone(id)
        ? client.LogInjection({ ...request, input: { ...input, injectionId: InjectionId.make(request.commandId) } })
        : client.CorrectInjection({ ...request, input: { ...input, injectionId: id.value } }),
    SucceededSaveInjection(),
    (message) => FailedSaveInjection({ message })
  )

export const updateInjections: {
  (
    message: InjectionsMessage,
    timezone: IanaTimezone,
    schedules: ReadonlyArray<Schedule>
  ): (model: InjectionsModel) => UpdateReturn
  (
    model: InjectionsModel,
    message: InjectionsMessage,
    timezone: IanaTimezone,
    schedules: ReadonlyArray<Schedule>
  ): UpdateReturn
} = Function.dual(
  4,
  (
    model: InjectionsModel,
    message: InjectionsMessage,
    timezone: IanaTimezone,
    schedules: ReadonlyArray<Schedule>
  ): UpdateReturn =>
    Match.value(message).pipe(
      Match.withReturnType<UpdateReturn>(),
      Match.tagsExhaustive({
        CancelledDeleteInjection: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
        ChangedInjectionDatetime: ({ value }) => ({ model: withForm(model, () => ({ datetime: value })) }),
        ChangedInjectionDoseMg: ({ value }) => ({
          model: withForm(model, () => ({ confirmedOffSchedule: false, doseMg: value })),
        }),
        ChangedInjectionCompound: ({ value }) => ({
          model: withForm(model, () => ({ confirmedOffSchedule: false, compound: value, scheduleId: '' })),
        }),
        ChangedInjectionNotes: ({ value }) => ({ model: withForm(model, () => ({ notes: value })) }),
        ChangedInjectionSchedule: ({ value }) => ({
          model: withForm(model, () => ({ confirmedOffSchedule: false, scheduleId: value })),
        }),
        ChangedInjectionSite: ({ value }) => ({ model: withForm(model, () => ({ site: value })) }),
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
          model.pendingDeleteId === null ? { model } : { model, mutation: removeInjection(model.pendingDeleteId) },
        ConfirmedInjectionOffSchedule: () => ({ model: withForm(model, () => ({ confirmedOffSchedule: true })) }),
        FailedDeleteInjection: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
        FailedSaveInjection: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
        CompletedOpenInjectionForm: ({ log, nowLocal }) => ({
          model: modifyFields(model, {
            form: () =>
              log === null
                ? {
                    confirmedOffSchedule: false,
                    datetime: nowLocal,
                    doseMg: '',
                    compound: '',
                    editingId: null,
                    error: null,
                    site: '',
                    maxDatetime: nowLocal,
                    notes: '',
                    originalDatetime: null,
                    scheduleId: '',
                    supplier: '',
                    submitting: false,
                  }
                : {
                    confirmedOffSchedule: false,
                    datetime: utcToLocalDatetimeString(log.administeredAt, timezone),
                    doseMg: String(log.doseMg),
                    compound: log.compound,
                    editingId: log.id,
                    error: null,
                    site: log.site ?? '',
                    maxDatetime: nowLocal,
                    notes: log.notes ?? '',
                    originalDatetime: log.administeredAt,
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
          if (model.form === null || model.form.submitting) {
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

          if (isOffScheduleDose(model.form, schedules) && !model.form.confirmedOffSchedule) {
            return {
              model: withForm(model, () => ({
                error: 'Confirm the off-schedule dose before saving',
                submitting: false,
              })),
            }
          }

          const { compound, doseMg, site, notes, supplier, scheduleId, editingId } = model.form
          const input = decodeInjection({
            administeredAt: datetime.value,
            compound,
            doseMg: Number(doseMg),
            site: Option.getOrNull(optionalText(site)),
            notes: Option.getOrNull(optionalText(notes)),
            supplier: Option.getOrNull(optionalText(supplier)),
            scheduleId: Option.getOrNull(optionalText(scheduleId)),
          })
          return Option.match(input, {
            onNone: () => ({ model: withForm(model, () => ({ error: 'Check the injection details.' })) }),
            onSome: (input) => ({
              model: withForm(model, () => ({ error: null, submitting: true })),
              mutation: saveInjection(Option.fromNullOr(editingId), input),
            }),
          })
        },
        SucceededDeleteInjection: () => ({ model: { ...model, pendingDeleteId: null } }),
        SucceededSaveInjection: () => ({ model: { ...model, form: null } }),
        ChangedInjectionAssignment: ({ injectionId, scheduleId }) => ({
          model,
          mutation: mutate(
            (request) =>
              client.AssignInjectionsToSchedule({ ...request, input: { injectionIds: [injectionId], scheduleId } }),
            SucceededInjectionAssignment(),
            (message) => FailedSaveInjection({ message })
          ),
        }),
        SucceededInjectionAssignment: () => ({ model }),
      })
    )
)
