import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { AssignInjectionsToSchedule } from '@garage/subq-domain/Journal/AssignInjectionsToSchedule.command'
import { CorrectInjection } from '@garage/subq-domain/Journal/CorrectInjection.command'
import { InjectionId } from '@garage/subq-domain/Journal/Journal.id'
import { NewInjection } from '@garage/subq-domain/Journal/JournalRecords'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import { LogInjection } from '@garage/subq-domain/Journal/LogInjection.command'
import { RemoveInjection } from '@garage/subq-domain/Journal/RemoveInjection.command'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

import { mutate } from '../../client.ts'
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
    () => RemoveInjection.make({ injectionId }),
    SucceededDeleteInjection(),
    (message) => FailedDeleteInjection({ message })
  )

const saveInjection = (id: Option.Option<InjectionId>, input: typeof NewInjection.Type) =>
  mutate(
    (commandId) =>
      Option.isNone(id)
        ? LogInjection.make({ ...input, injectionId: InjectionId.make(commandId) })
        : CorrectInjection.make({ ...input, injectionId: id.value }),
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
        CancelledDeleteInjection: () => ({ model: Struct.evolve(model, { pendingDeleteId: () => null }) }),
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
        ClickedAddInjection: () => ({ model, commands: [OpenInjectionForm.make({ log: null, timezone })] }),
        ClickedCancelInjectionForm: () => ({ model: Struct.evolve(model, { form: () => null }) }),
        ClickedEditInjection: ({ log }) => ({ model, commands: [OpenInjectionForm.make({ log, timezone })] }),
        ClickedInjectionPage: ({ delta }) => ({ model: Struct.evolve(model, { page: (page) => page + delta }) }),
        ClickedInjectionSort: ({ column }) => ({
          model: Struct.evolve(model, {
            page: () => 0,
            sortColumn: () => column,
            sortDesc: (desc) => (model.sortColumn === column ? !desc : true),
          }),
        }),
        ConfirmedDeleteInjection: () =>
          model.pendingDeleteId === null ? { model } : { model, mutation: removeInjection(model.pendingDeleteId) },
        ConfirmedInjectionOffSchedule: () => ({ model: withForm(model, () => ({ confirmedOffSchedule: true })) }),
        FailedDeleteInjection: () => ({ model: Struct.evolve(model, { pendingDeleteId: () => null }) }),
        FailedSaveInjection: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
        CompletedOpenInjectionForm: ({ log, nowLocal }) => ({
          model: Struct.evolve(model, {
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
          model: Struct.evolve(model, { form: () => null, pendingDeleteId: () => id }),
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
            () => AssignInjectionsToSchedule.make({ injectionIds: [injectionId], scheduleId }),
            SucceededInjectionAssignment(),
            (message) => FailedSaveInjection({ message })
          ),
        }),
        SucceededInjectionAssignment: () => ({ model }),
      })
    )
)
