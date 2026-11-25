import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { ScheduleId, SchedulePhaseId } from '@garage/subq-domain/Journal/Journal.id'
import { NewSchedule } from '@garage/subq-domain/Journal/JournalRecords'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import { DoseMg, MedicationCompound, PhaseDurationDays, PhaseOrder } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import * as Struct from 'effect/Struct'
import { modifyFields } from 'foldkit/struct'

import { client, mutate } from '../../client.ts'
import type { PageUpdate } from '../../client.ts'
import { optionalText, withForm } from '../../lib/form.ts'
import { OpenScheduleForm } from './command.ts'
import {
  FailedActivateSchedule,
  FailedDeleteSchedule,
  FailedSaveSchedule,
  SucceededActivateSchedule,
  SucceededDeleteSchedule,
  SucceededSaveSchedule,
} from './model.ts'
import type { ScheduleForm, ScheduleMessage, ScheduleModel, SchedulePhaseForm } from './model.ts'

type UpdateReturn = PageUpdate<ScheduleModel, ScheduleMessage>

const decodeSchedule = Schema.decodeUnknownOption(Schema.Struct(Struct.omit(NewSchedule.fields, ['phases'])))

const changeScheduleActivity = ({ id: scheduleId, isActive }: Schedule) =>
  mutate(
    (request) =>
      isActive
        ? client.DeactivateSchedule({ ...request, input: { scheduleId } })
        : client.ActivateSchedule({ ...request, input: { scheduleId } }),
    SucceededActivateSchedule(),
    (message) => FailedActivateSchedule({ message })
  )

const removeSchedule = (scheduleId: ScheduleId) =>
  mutate(
    (request) => client.RemoveSchedule({ ...request, input: { scheduleId } }),
    SucceededDeleteSchedule(),
    (message) => FailedDeleteSchedule({ message })
  )

const saveSchedule = (
  id: Option.Option<ScheduleId>,
  fields: Omit<typeof NewSchedule.Type, 'phases'>,
  phases: ReadonlyArray<SchedulePhaseForm>
) =>
  mutate(
    (request) => {
      const input = {
        ...fields,
        scheduleId: Option.getOrElse(id, () => ScheduleId.make(request.commandId)),
        phases: Arr.map(phases, (phase, index) => ({
          id: phase.id ?? SchedulePhaseId.make(`${request.commandId}:phase:${index}`),
          order: PhaseOrder.make(index + 1),
          doseMg: DoseMg.make(Number(phase.doseMg)),
          durationDays: phase.isIndefinite ? null : PhaseDurationDays.make(Math.trunc(Number(phase.durationDays))),
        })),
      }
      return Option.isNone(id)
        ? client.CreateSchedule({ ...request, input })
        : client.ReviseSchedule({ ...request, input })
    },
    SucceededSaveSchedule(),
    (message) => FailedSaveSchedule({ message })
  )

const defaultPhase = (order: number): SchedulePhaseForm => ({
  id: null,
  doseMg: '',
  durationDays: '28',
  isIndefinite: false,
  order,
})

const reorderPhases = (phases: ReadonlyArray<SchedulePhaseForm>): ReadonlyArray<SchedulePhaseForm> =>
  Arr.map(phases, (phase, index) => modifyFields(phase, { order: () => index + 1 }))

const updatePhase = (
  phases: ReadonlyArray<SchedulePhaseForm>,
  index: number,
  update: (phase: SchedulePhaseForm) => SchedulePhaseForm
): ReadonlyArray<SchedulePhaseForm> =>
  reorderPhases(Arr.map(phases, (phase, current) => (current === index ? update(phase) : phase)))

const parseDoseMg = (value: string): Option.Option<DoseMg> => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? Option.some(DoseMg.make(parsed)) : Option.none()
}

const validatePhase = (phase: SchedulePhaseForm, index: number, total: number): Option.Option<string> => {
  if (Option.isNone(parseDoseMg(phase.doseMg))) {
    return Option.some(`Phase ${index + 1}: enter a positive dose in milligrams`)
  }

  if (!phase.isIndefinite) {
    const days = Math.trunc(Number(phase.durationDays))

    if (!Number.isFinite(days) || days <= 0) {
      return Option.some(`Phase ${index + 1}: duration is required`)
    }
  }

  if (phase.isIndefinite && index < total - 1) {
    return Option.some('Only the last phase can be indefinite')
  }

  return Option.none()
}

const validateScheduleForm = (form: ScheduleForm): Option.Option<string> => {
  if (Str.trim(form.name) === '') {
    return Option.some('Schedule name is required')
  }

  if (!Schema.is(MedicationCompound)(form.compound)) {
    return Option.some('Select a supported medication')
  }

  if (form.startDate === '') {
    return Option.some('Start date is required')
  }

  if (Arr.isReadonlyArrayEmpty(form.phases)) {
    return Option.some('At least one phase is required')
  }

  return Arr.findFirst(form.phases, (phase, index) => validatePhase(phase, index, form.phases.length))
}

export const updateSchedule: {
  (message: ScheduleMessage, timezone: IanaTimezone): (model: ScheduleModel) => UpdateReturn
  (model: ScheduleModel, message: ScheduleMessage, timezone: IanaTimezone): UpdateReturn
} = Function.dual(3, (model: ScheduleModel, message: ScheduleMessage, timezone: IanaTimezone): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      AddedSchedulePhase: () => ({
        model: withForm(model, (form) => ({
          phases: [
            ...Arr.map(form.phases, (phase) =>
              phase.isIndefinite ? modifyFields(phase, { durationDays: () => '28', isIndefinite: () => false }) : phase
            ),
            defaultPhase(form.phases.length + 1),
          ],
        })),
      }),
      CancelledDeleteSchedule: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      ChangedScheduleCompound: ({ value }) => ({ model: withForm(model, () => ({ compound: value })) }),
      ChangedScheduleSupplier: ({ value }) => ({ model: withForm(model, () => ({ supplier: value })) }),
      ChangedScheduleFrequency: ({ value }) => ({ model: withForm(model, () => ({ frequency: value })) }),
      ChangedScheduleName: ({ value }) => ({ model: withForm(model, () => ({ name: value })) }),
      ChangedScheduleNotes: ({ value }) => ({ model: withForm(model, () => ({ notes: value })) }),
      ChangedSchedulePhaseDoseMg: ({ index, value }) => ({
        model: withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) => modifyFields(phase, { doseMg: () => value })),
        })),
      }),
      ChangedSchedulePhaseDuration: ({ index, value }) => ({
        model: withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) => modifyFields(phase, { durationDays: () => value })),
        })),
      }),
      ChangedScheduleStartDate: ({ value }) => ({ model: withForm(model, () => ({ startDate: value })) }),
      ClickedToggleScheduleActivity: ({ schedule }) => ({ model, mutation: changeScheduleActivity(schedule) }),
      ClickedAddSchedule: () => ({ model, commands: [OpenScheduleForm({ schedule: null, timezone })] }),
      ClickedCancelScheduleForm: () => ({ model: modifyFields(model, { form: () => null }) }),
      ClickedEditSchedule: ({ schedule }) => ({ model, commands: [OpenScheduleForm({ schedule, timezone })] }),
      ConfirmedDeleteSchedule: () =>
        model.pendingDeleteId === null ? { model } : { model, mutation: removeSchedule(model.pendingDeleteId) },
      FailedActivateSchedule: () => ({ model }),
      FailedDeleteSchedule: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
      FailedSaveSchedule: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
      CompletedOpenScheduleForm: ({ schedule, todayLocal }) => ({
        model: modifyFields(model, {
          form: () =>
            schedule === null
              ? {
                  compound: '',
                  supplier: '',
                  editingId: null,
                  error: null,
                  frequency: 'weekly',
                  name: '',
                  notes: '',
                  phases: [defaultPhase(1)],
                  startDate: todayLocal,
                  submitting: false,
                }
              : {
                  compound: schedule.compound,
                  supplier: schedule.supplier ?? '',
                  editingId: schedule.id,
                  error: null,
                  frequency: schedule.frequency,
                  name: schedule.name,
                  notes: schedule.notes ?? '',
                  phases: reorderPhases(
                    Arr.map(schedule.phases, (phase) => ({
                      id: phase.id,
                      doseMg: String(phase.doseMg),
                      durationDays: phase.durationDays === null ? '' : String(phase.durationDays),
                      isIndefinite: phase.durationDays === null,
                      order: phase.order,
                    }))
                  ),
                  startDate: schedule.startDate,
                  submitting: false,
                },
          pendingDeleteId: () => null,
        }),
      }),
      RemovedSchedulePhase: ({ index }) => ({
        model: withForm(model, (form) =>
          form.phases.length <= 1
            ? {}
            : { phases: reorderPhases(Arr.filter(form.phases, (_, current) => current !== index)) }
        ),
      }),
      RequestedDeleteSchedule: ({ id }) => ({
        model: modifyFields(model, { form: () => null, pendingDeleteId: () => id }),
      }),
      SubmittedScheduleForm: () => {
        if (model.form === null || model.form.submitting) {
          return { model }
        }

        const validationError = validateScheduleForm(model.form)

        if (Option.isSome(validationError)) {
          return { model: withForm(model, () => ({ error: validationError.value, submitting: false })) }
        }

        const { editingId, compound, frequency, name, notes, phases, startDate, supplier } = model.form
        const input = decodeSchedule({
          compound,
          frequency,
          name: Str.trim(name),
          notes: Option.getOrNull(optionalText(notes)),
          startDate,
          supplier: Option.getOrNull(optionalText(supplier)),
        })
        if (Option.isNone(input)) {
          return { model: withForm(model, () => ({ error: 'Check the schedule details.' })) }
        }

        return {
          model: withForm(model, () => ({ error: null, submitting: true })),
          mutation: saveSchedule(Option.fromNullOr(editingId), input.value, phases),
        }
      },
      SucceededActivateSchedule: () => ({ model }),
      SucceededDeleteSchedule: () => ({ model: { ...model, pendingDeleteId: null } }),
      SucceededSaveSchedule: () => ({ model: { ...model, form: null } }),
      ToggledSchedulePhaseIndefinite: ({ checked, index }) => ({
        model: withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) =>
            modifyFields(phase, {
              durationDays: () => (checked ? '' : '28'),
              isIndefinite: () => checked,
            })
          ),
        })),
      }),
    })
  )
)
