import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { AsyncData } from 'foldkit'
import type { Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { CalendarDate, DoseMg, MedicationCompound } from '#shared'
import type { IanaTimezone } from '#shared'

import type { Api } from '../../api.js'
import { FailedFetchSettings, FetchSettings, SucceededFetchSettings } from '../../data/settings.js'
import { withForm } from '../../lib/form.js'
import {
  ActivateSchedule,
  DeleteSchedule,
  FetchNextDose,
  FetchSchedules,
  OpenScheduleForm,
  SaveSchedule,
} from './command.js'
import {
  CompletedOpenScheduleForm,
  FailedActivateSchedule,
  FailedDeleteSchedule,
  FailedFetchNextDose,
  FailedFetchSchedules,
  FailedSaveSchedule,
  SucceededActivateSchedule,
  SucceededDeleteSchedule,
  SucceededFetchNextDose,
  SucceededFetchSchedules,
  SucceededSaveSchedule,
} from './model.js'
import type { ScheduleForm, ScheduleMessage, ScheduleModel, SchedulePhaseForm } from './model.js'

// ============================================
// Update
// ============================================

const ScheduleCommandMessage = Schema.Union([
  SucceededFetchSettings,
  FailedFetchSettings,
  SucceededFetchSchedules,
  FailedFetchSchedules,
  SucceededFetchNextDose,
  FailedFetchNextDose,
  CompletedOpenScheduleForm,
  SucceededSaveSchedule,
  FailedSaveSchedule,
  SucceededDeleteSchedule,
  FailedDeleteSchedule,
  SucceededActivateSchedule,
  FailedActivateSchedule,
])

type ScheduleCommandMessage = typeof ScheduleCommandMessage.Type

type UpdateReturn = Update.Return<ScheduleModel, ScheduleCommandMessage, Api>

const fetchNextDose = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn => {
  const requestKey = model.nextDoseRequestKey + 1

  return {
    model: modifyFields(model, { nextDose: () => AsyncData.Loading(), nextDoseRequestKey: () => requestKey }),
    commands: [FetchNextDose({ requestKey, requestedTimezone: timezone })],
  }
}

export const fetchScheduleIfIdle: {
  (timezone: IanaTimezone): (model: ScheduleModel) => UpdateReturn
  (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn
} = Function.dual(2, (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn => {
  const commands: Array<Command.Command<ScheduleCommandMessage, never, Api>> = []
  let next = model

  if (AsyncData.isIdle(next.schedules)) {
    next = modifyFields(next, { schedules: () => AsyncData.Loading() })
    commands.push(FetchSchedules())
  }

  if (AsyncData.isIdle(next.nextDose)) {
    const { model: nextWithDose, commands: nextDoseCommands = [] } = fetchNextDose(next, timezone)
    next = nextWithDose
    commands.push(...nextDoseCommands)
  }

  return { model: next, commands }
})

const defaultPhase = (order: number): SchedulePhaseForm => ({
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

    if (Number.isNaN(days) || days <= 0) {
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

  if (!Schema.is(MedicationCompound)(form.drug)) {
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

const refreshSchedules = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn => {
  const { model: withNextDose, commands: nextDoseCommands = [] } = fetchNextDose(model, timezone)

  return {
    model: modifyFields(withNextDose, { schedules: () => AsyncData.Loading() }),
    commands: [FetchSchedules(), ...nextDoseCommands],
  }
}

const ignoreStaleNextDose = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn =>
  AsyncData.isIdle(model.nextDose) ? fetchNextDose(model, timezone) : { model }

export const updateSchedule: {
  (
    message: ScheduleMessage,
    timezone: IanaTimezone,
    settingsRequestGeneration: number
  ): (model: ScheduleModel) => UpdateReturn
  (
    model: ScheduleModel,
    message: ScheduleMessage,
    timezone: IanaTimezone,
    settingsRequestGeneration: number
  ): UpdateReturn
} = Function.dual(
  4,
  (
    model: ScheduleModel,
    message: ScheduleMessage,
    timezone: IanaTimezone,
    settingsRequestGeneration: number
  ): UpdateReturn =>
    Match.value(message).pipe(
      Match.withReturnType<UpdateReturn>(),
      Match.tagsExhaustive({
        AddedSchedulePhase: () => ({
          model: withForm(model, (form) => ({
            phases: [
              ...Arr.map(form.phases, (phase) =>
                phase.isIndefinite
                  ? modifyFields(phase, { durationDays: () => '28', isIndefinite: () => false })
                  : phase
              ),
              defaultPhase(form.phases.length + 1),
            ],
          })),
        }),
        CancelledDeleteSchedule: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
        ChangedScheduleDrug: ({ value }) => ({ model: withForm(model, () => ({ drug: value })) }),
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
        ClickedActivateSchedule: ({ schedule }) => ({ model, commands: [ActivateSchedule({ id: schedule.id })] }),
        ClickedAddSchedule: () => ({ model, commands: [OpenScheduleForm({ schedule: null, timezone })] }),
        ClickedCancelScheduleForm: () => ({ model: modifyFields(model, { form: () => null }) }),
        ClickedEditSchedule: ({ schedule }) => ({ model, commands: [OpenScheduleForm({ schedule, timezone })] }),
        ConfirmedDeleteSchedule: () =>
          model.pendingDeleteId === null
            ? { model }
            : { model, commands: [DeleteSchedule({ id: model.pendingDeleteId })] },
        FailedActivateSchedule: () => ({ model }),
        FailedDeleteSchedule: () => ({ model: modifyFields(model, { pendingDeleteId: () => null }) }),
        FailedFetchNextDose: ({ message: error, requestKey, requestedTimezone }) =>
          requestKey !== model.nextDoseRequestKey || requestedTimezone !== timezone
            ? ignoreStaleNextDose(model, timezone)
            : { model: modifyFields(model, { nextDose: () => AsyncData.Failure({ error }) }) },
        FailedFetchSchedules: ({ message: error }) => ({
          model: modifyFields(model, { schedules: () => AsyncData.Failure({ error }) }),
        }),
        FailedSaveSchedule: ({ message: error }) => ({ model: withForm(model, () => ({ error, submitting: false })) }),
        CompletedOpenScheduleForm: ({ schedule, todayLocal }) => ({
          model: modifyFields(model, {
            form: () =>
              schedule === null
                ? {
                    drug: '',
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
                    drug: schedule.drug,
                    supplier: schedule.supplier ?? '',
                    editingId: schedule.id,
                    error: null,
                    frequency: schedule.frequency,
                    name: schedule.name,
                    notes: schedule.notes ?? '',
                    phases: reorderPhases(
                      Arr.map(schedule.phases, (phase) => ({
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
          if (model.form === null) {
            return { model }
          }

          const validationError = validateScheduleForm(model.form)

          if (Option.isSome(validationError)) {
            return { model: withForm(model, () => ({ error: validationError.value, submitting: false })) }
          }

          const startDate = Schema.decodeOption(CalendarDate)(model.form.startDate)

          if (Option.isNone(startDate)) {
            return { model: withForm(model, () => ({ error: 'Enter a valid start date', submitting: false })) }
          }

          return {
            model: withForm(model, () => ({ error: null, submitting: true })),
            commands: [
              SaveSchedule({
                drug: model.form.drug,
                supplier: model.form.supplier,
                editingId: model.form.editingId,
                frequency: model.form.frequency,
                name: model.form.name,
                notes: model.form.notes,
                phases: model.form.phases,
                startDate: startDate.value,
              }),
            ],
          }
        },
        SucceededActivateSchedule: () => refreshSchedules(model, timezone),
        SucceededDeleteSchedule: () => refreshSchedules(modifyFields(model, { pendingDeleteId: () => null }), timezone),
        SucceededFetchNextDose: ({ nextDose, requestKey, requestedTimezone, timezone: responseTimezone }) => {
          const currentRequest = requestKey === model.nextDoseRequestKey && requestedTimezone === timezone

          if (!currentRequest) {
            return ignoreStaleNextDose(model, timezone)
          }

          if (responseTimezone !== timezone) {
            return {
              model: modifyFields(model, { nextDose: () => AsyncData.Idle() }),
              commands: [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
            }
          }

          return { model: modifyFields(model, { nextDose: () => AsyncData.succeed(Option.fromNullOr(nextDose)) }) }
        },
        SucceededFetchSchedules: ({ schedules }) => ({
          model: modifyFields(model, { schedules: () => AsyncData.succeed(schedules) }),
        }),
        SucceededSaveSchedule: () => refreshSchedules(modifyFields(model, { form: () => null }), timezone),
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
