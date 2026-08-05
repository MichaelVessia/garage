import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import type { HtmlBuilder } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import {
  CalendarDate,
  DoseMg,
  MedicationCompound,
  Frequency,
  InjectionSchedule,
  InjectionScheduleCreate,
  InjectionScheduleDelete,
  InjectionScheduleId,
  InjectionScheduleUpdate,
  IanaTimezone,
  NextScheduledDose,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
  Supplier,
  listMedicationCompounds,
  suggestedDoseMgForCompound,
} from '#shared'

import { Api } from '../api.js'
import { FetchSettings } from '../data/settings.js'
import type { FailedFetchSettings, SucceededFetchSettings } from '../data/settings.js'
import { toCommandResult } from '../lib/command.js'
import { formatDate, formatShortDate, utcToLocalDateString } from '../lib/datetime.js'
import { withForm } from '../lib/form.js'
import { FREQUENCIES, frequencyFromString, frequencyLabel } from '../lib/frequency.js'
import { viewDatalist } from '../lib/view.js'
import { scheduleViewRouter } from '../route.js'
import { button, card, input, select } from '../ui.js'

// ============================================
// Model
// ============================================

export const SchedulesData = AsyncData.Schema(Schema.Array(InjectionSchedule), Schema.String).schema
export type SchedulesData = AsyncData.AsyncData<ReadonlyArray<InjectionSchedule>, string>

export const NextDoseData = AsyncData.Schema(Schema.OptionFromNullOr(NextScheduledDose), Schema.String).schema
export type NextDoseData = AsyncData.AsyncData<Option.Option<NextScheduledDose>, string>

const SchedulePhaseForm = Schema.Struct({
  order: Schema.Number,
  durationDays: Schema.String,
  doseMg: Schema.String,
  isIndefinite: Schema.Boolean,
})
type SchedulePhaseForm = typeof SchedulePhaseForm.Type

const ScheduleForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionScheduleId),
  name: Schema.String,
  drug: Schema.String,
  supplier: Schema.String,
  frequency: Frequency,
  startDate: Schema.String,
  notes: Schema.String,
  phases: Schema.Array(SchedulePhaseForm),
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})
type ScheduleForm = typeof ScheduleForm.Type

export const ScheduleModel = Schema.Struct({
  schedules: SchedulesData,
  nextDose: NextDoseData,
  nextDoseRequestKey: Schema.Number,
  form: Schema.NullOr(ScheduleForm),
  pendingDeleteId: Schema.NullOr(InjectionScheduleId),
})
export type ScheduleModel = typeof ScheduleModel.Type

export const initialScheduleModel: ScheduleModel = {
  form: null,
  nextDose: AsyncData.Idle(),
  nextDoseRequestKey: 0,
  pendingDeleteId: null,
  schedules: AsyncData.Idle(),
}

// ============================================
// Messages
// ============================================

export const SucceededFetchSchedules = m('SucceededFetchSchedules', {
  schedules: Schema.Array(InjectionSchedule),
})
export const FailedFetchSchedules = m('FailedFetchSchedules', { message: Schema.String })
export const SucceededFetchNextDose = m('SucceededFetchNextDose', {
  nextDose: Schema.NullOr(NextScheduledDose),
  requestKey: Schema.Number,
  requestedTimezone: IanaTimezone,
  timezone: IanaTimezone,
})
export const FailedFetchNextDose = m('FailedFetchNextDose', {
  message: Schema.String,
  requestKey: Schema.Number,
  requestedTimezone: IanaTimezone,
})
export const CompletedOpenScheduleForm = m('CompletedOpenScheduleForm', {
  todayLocal: Schema.String,
  schedule: Schema.NullOr(InjectionSchedule),
})
export const ClickedAddSchedule = m('ClickedAddSchedule')
export const ClickedEditSchedule = m('ClickedEditSchedule', { schedule: InjectionSchedule })
export const ClickedCancelScheduleForm = m('ClickedCancelScheduleForm')
export const ChangedScheduleName = m('ChangedScheduleName', { value: Schema.String })
export const ChangedScheduleDrug = m('ChangedScheduleDrug', { value: Schema.String })
export const ChangedScheduleSupplier = m('ChangedScheduleSupplier', { value: Schema.String })
export const ChangedScheduleFrequency = m('ChangedScheduleFrequency', { value: Frequency })
export const ChangedScheduleStartDate = m('ChangedScheduleStartDate', { value: Schema.String })
export const ChangedScheduleNotes = m('ChangedScheduleNotes', { value: Schema.String })
export const AddedSchedulePhase = m('AddedSchedulePhase')
export const RemovedSchedulePhase = m('RemovedSchedulePhase', { index: Schema.Number })
export const ChangedSchedulePhaseDoseMg = m('ChangedSchedulePhaseDoseMg', {
  index: Schema.Number,
  value: Schema.String,
})
export const ChangedSchedulePhaseDuration = m('ChangedSchedulePhaseDuration', {
  index: Schema.Number,
  value: Schema.String,
})
export const ToggledSchedulePhaseIndefinite = m('ToggledSchedulePhaseIndefinite', {
  index: Schema.Number,
  checked: Schema.Boolean,
})
export const SubmittedScheduleForm = m('SubmittedScheduleForm')
export const SucceededSaveSchedule = m('SucceededSaveSchedule')
export const FailedSaveSchedule = m('FailedSaveSchedule', { message: Schema.String })
export const RequestedDeleteSchedule = m('RequestedDeleteSchedule', { id: InjectionScheduleId })
export const CancelledDeleteSchedule = m('CancelledDeleteSchedule')
export const ConfirmedDeleteSchedule = m('ConfirmedDeleteSchedule')
export const SucceededDeleteSchedule = m('SucceededDeleteSchedule')
export const FailedDeleteSchedule = m('FailedDeleteSchedule', { message: Schema.String })
export const ClickedActivateSchedule = m('ClickedActivateSchedule', { schedule: InjectionSchedule })
export const SucceededActivateSchedule = m('SucceededActivateSchedule')
export const FailedActivateSchedule = m('FailedActivateSchedule', { message: Schema.String })

export const ScheduleMessage = Schema.Union([
  SucceededFetchSchedules,
  FailedFetchSchedules,
  SucceededFetchNextDose,
  FailedFetchNextDose,
  CompletedOpenScheduleForm,
  ClickedAddSchedule,
  ClickedEditSchedule,
  ClickedCancelScheduleForm,
  ChangedScheduleName,
  ChangedScheduleDrug,
  ChangedScheduleSupplier,
  ChangedScheduleFrequency,
  ChangedScheduleStartDate,
  ChangedScheduleNotes,
  AddedSchedulePhase,
  RemovedSchedulePhase,
  ChangedSchedulePhaseDoseMg,
  ChangedSchedulePhaseDuration,
  ToggledSchedulePhaseIndefinite,
  SubmittedScheduleForm,
  SucceededSaveSchedule,
  FailedSaveSchedule,
  RequestedDeleteSchedule,
  CancelledDeleteSchedule,
  ConfirmedDeleteSchedule,
  SucceededDeleteSchedule,
  FailedDeleteSchedule,
  ClickedActivateSchedule,
  SucceededActivateSchedule,
  FailedActivateSchedule,
])
export type ScheduleMessage = typeof ScheduleMessage.Type

// ============================================
// Commands
// ============================================

export const FetchSchedules = Command.define('FetchSchedules', {
  messages: [SucceededFetchSchedules, FailedFetchSchedules],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const schedules = yield* api.ScheduleList()
    return SucceededFetchSchedules({ schedules })
  }).pipe(toCommandResult(FailedFetchSchedules, 'Failed to load schedules')),
})

export const FetchNextDose = Command.define('FetchNextDose', {
  args: { requestKey: Schema.Number, requestedTimezone: IanaTimezone },
  messages: [SucceededFetchNextDose, FailedFetchNextDose],
  execute: ({ requestKey, requestedTimezone }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const result = yield* api.ScheduleGetNextDose()
      return SucceededFetchNextDose({
        nextDose: result.nextDose,
        requestKey,
        requestedTimezone,
        timezone: result.timezone,
      })
    }).pipe(
      Effect.tapError((cause) => Effect.logDebug('FetchNextDose failed', { error: cause })),
      Effect.orElseSucceed(() =>
        FailedFetchNextDose({ message: 'Failed to load next dose', requestKey, requestedTimezone })
      )
    ),
})

const OpenScheduleForm = Command.define('OpenScheduleForm', {
  args: { schedule: Schema.NullOr(InjectionSchedule), timezone: IanaTimezone },
  messages: [CompletedOpenScheduleForm],
  execute: ({ schedule, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenScheduleForm({ schedule, todayLocal: utcToLocalDateString(now, timezone) }))
    ),
})

const SaveSchedule = Command.define('SaveSchedule', {
  args: {
    editingId: Schema.NullOr(InjectionScheduleId),
    name: Schema.String,
    drug: Schema.String,
    supplier: Schema.String,
    frequency: Frequency,
    startDate: CalendarDate,
    notes: Schema.String,
    phases: Schema.Array(SchedulePhaseForm),
  },
  messages: [SucceededSaveSchedule, FailedSaveSchedule],
  execute: ({ drug, editingId, frequency, name, notes, phases, startDate, supplier }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const compound = yield* Schema.decodeUnknownEffect(MedicationCompound)(drug)
      const phaseCreates = yield* Effect.forEach(
        phases,
        (phase, index) =>
          Schema.decodeUnknownEffect(DoseMg)(Number(phase.doseMg)).pipe(
            Effect.map(
              (doseMg) =>
                new SchedulePhaseCreate({
                  doseMg,
                  durationDays: phase.isIndefinite
                    ? null
                    : PhaseDurationDays.make(Number.parseInt(phase.durationDays, 10)),
                  order: PhaseOrder.make(index + 1),
                })
            )
          ),
        { concurrency: 1 }
      )
      yield* editingId === null
        ? api.ScheduleCreate(
            new InjectionScheduleCreate({
              drug: compound,
              frequency,
              name: ScheduleName.make(name.trim()),
              notes: notes.trim() === '' ? Option.none<Notes>() : Option.some(Notes.make(notes.trim())),
              phases: phaseCreates,
              supplier: supplier.trim() === '' ? Option.none<Supplier>() : Option.some(Supplier.make(supplier.trim())),
              startDate,
            })
          )
        : api.ScheduleUpdate(
            new InjectionScheduleUpdate({
              drug: compound,
              frequency,
              id: editingId,
              name: ScheduleName.make(name.trim()),
              notes: notes.trim() === '' ? null : Notes.make(notes.trim()),
              phases: phaseCreates,
              supplier: supplier.trim() === '' ? null : Supplier.make(supplier.trim()),
              startDate,
            })
          )
      return SucceededSaveSchedule()
    }).pipe(toCommandResult(FailedSaveSchedule, 'Failed to save schedule')),
})

const DeleteSchedule = Command.define('DeleteSchedule', {
  args: { id: InjectionScheduleId },
  messages: [SucceededDeleteSchedule, FailedDeleteSchedule],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.ScheduleDelete(new InjectionScheduleDelete({ id }))
      return SucceededDeleteSchedule()
    }).pipe(toCommandResult(FailedDeleteSchedule, 'Failed to delete schedule')),
})

const ActivateSchedule = Command.define('ActivateSchedule', {
  args: { id: InjectionScheduleId },
  messages: [SucceededActivateSchedule, FailedActivateSchedule],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.ScheduleUpdate(new InjectionScheduleUpdate({ id, isActive: true }))
      return SucceededActivateSchedule()
    }).pipe(toCommandResult(FailedActivateSchedule, 'Failed to activate schedule')),
})

// ============================================
// Update
// ============================================

type ScheduleCommandMessage =
  | typeof SucceededFetchSettings.Type
  | typeof FailedFetchSettings.Type
  | typeof SucceededFetchSchedules.Type
  | typeof FailedFetchSchedules.Type
  | typeof SucceededFetchNextDose.Type
  | typeof FailedFetchNextDose.Type
  | typeof CompletedOpenScheduleForm.Type
  | typeof SucceededSaveSchedule.Type
  | typeof FailedSaveSchedule.Type
  | typeof SucceededDeleteSchedule.Type
  | typeof FailedDeleteSchedule.Type
  | typeof SucceededActivateSchedule.Type
  | typeof FailedActivateSchedule.Type

type UpdateReturn = readonly [ScheduleModel, ReadonlyArray<Command.Command<ScheduleCommandMessage, never, Api>>]

const fetchNextDose = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn => {
  const requestKey = model.nextDoseRequestKey + 1
  return [
    evo(model, { nextDose: () => AsyncData.Loading(), nextDoseRequestKey: () => requestKey }),
    [FetchNextDose({ requestKey, requestedTimezone: timezone })],
  ]
}

export const fetchScheduleIfIdle = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn => {
  const commands: Array<Command.Command<ScheduleCommandMessage, never, Api>> = []
  let next = model
  if (AsyncData.isIdle(next.schedules)) {
    next = evo(next, { schedules: () => AsyncData.Loading() })
    commands.push(FetchSchedules())
  }
  if (AsyncData.isIdle(next.nextDose)) {
    const [nextWithDose, nextDoseCommands] = fetchNextDose(next, timezone)
    next = nextWithDose
    commands.push(...nextDoseCommands)
  }
  return [next, commands]
}

const defaultPhase = (order: number): SchedulePhaseForm => ({
  doseMg: '',
  durationDays: '28',
  isIndefinite: false,
  order,
})

const reorderPhases = (phases: ReadonlyArray<SchedulePhaseForm>): ReadonlyArray<SchedulePhaseForm> =>
  phases.map((phase, index) => evo(phase, { order: () => index + 1 }))

const updatePhase = (
  phases: ReadonlyArray<SchedulePhaseForm>,
  index: number,
  update: (phase: SchedulePhaseForm) => SchedulePhaseForm
): ReadonlyArray<SchedulePhaseForm> =>
  reorderPhases(phases.map((phase, current) => (current === index ? update(phase) : phase)))

const parseDoseMg = (value: string): Option.Option<DoseMg> => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Option.some(DoseMg.make(parsed)) : Option.none()
}

const validatePhase = (phase: SchedulePhaseForm, index: number, total: number): Option.Option<string> => {
  if (Option.isNone(parseDoseMg(phase.doseMg))) {
    return Option.some(`Phase ${index + 1}: enter a positive dose in milligrams`)
  }
  if (!phase.isIndefinite) {
    const days = Number.parseInt(phase.durationDays, 10)
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
  if (form.name.trim() === '') {
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
  const [withNextDose, nextDoseCommands] = fetchNextDose(model, timezone)
  return [evo(withNextDose, { schedules: () => AsyncData.Loading() }), [FetchSchedules(), ...nextDoseCommands]]
}

const ignoreStaleNextDose = (model: ScheduleModel, timezone: IanaTimezone): UpdateReturn =>
  AsyncData.isIdle(model.nextDose) ? fetchNextDose(model, timezone) : [model, []]

export const updateSchedule = (
  model: ScheduleModel,
  message: ScheduleMessage,
  timezone: IanaTimezone,
  settingsRequestGeneration: number
): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      AddedSchedulePhase: () => [
        withForm(model, (form) => ({
          phases: [
            ...form.phases.map((phase) =>
              phase.isIndefinite ? evo(phase, { durationDays: () => '28', isIndefinite: () => false }) : phase
            ),
            defaultPhase(form.phases.length + 1),
          ],
        })),
        [],
      ],
      CancelledDeleteSchedule: () => [evo(model, { pendingDeleteId: () => null }), []],
      ChangedScheduleDrug: ({ value }) => [withForm(model, () => ({ drug: value })), []],
      ChangedScheduleSupplier: ({ value }) => [withForm(model, () => ({ supplier: value })), []],
      ChangedScheduleFrequency: ({ value }) => [withForm(model, () => ({ frequency: value })), []],
      ChangedScheduleName: ({ value }) => [withForm(model, () => ({ name: value })), []],
      ChangedScheduleNotes: ({ value }) => [withForm(model, () => ({ notes: value })), []],
      ChangedSchedulePhaseDoseMg: ({ index, value }) => [
        withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) => evo(phase, { doseMg: () => value })),
        })),
        [],
      ],
      ChangedSchedulePhaseDuration: ({ index, value }) => [
        withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) => evo(phase, { durationDays: () => value })),
        })),
        [],
      ],
      ChangedScheduleStartDate: ({ value }) => [withForm(model, () => ({ startDate: value })), []],
      ClickedActivateSchedule: ({ schedule }) => [model, [ActivateSchedule({ id: schedule.id })]],
      ClickedAddSchedule: () => [model, [OpenScheduleForm({ schedule: null, timezone })]],
      ClickedCancelScheduleForm: () => [evo(model, { form: () => null }), []],
      ClickedEditSchedule: ({ schedule }) => [model, [OpenScheduleForm({ schedule, timezone })]],
      ConfirmedDeleteSchedule: () =>
        model.pendingDeleteId === null ? [model, []] : [model, [DeleteSchedule({ id: model.pendingDeleteId })]],
      FailedActivateSchedule: () => [model, []],
      FailedDeleteSchedule: () => [evo(model, { pendingDeleteId: () => null }), []],
      FailedFetchNextDose: ({ message: error, requestKey, requestedTimezone }) =>
        requestKey !== model.nextDoseRequestKey || requestedTimezone !== timezone
          ? ignoreStaleNextDose(model, timezone)
          : [evo(model, { nextDose: () => AsyncData.Failure({ error }) }), []],
      FailedFetchSchedules: ({ message: error }) => [evo(model, { schedules: () => AsyncData.Failure({ error }) }), []],
      FailedSaveSchedule: ({ message: error }) => [withForm(model, () => ({ error, submitting: false })), []],
      CompletedOpenScheduleForm: ({ schedule, todayLocal }) => [
        evo(model, {
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
                    schedule.phases.map((phase) => ({
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
        [],
      ],
      RemovedSchedulePhase: ({ index }) => [
        withForm(model, (form) =>
          form.phases.length <= 1
            ? {}
            : { phases: reorderPhases(form.phases.filter((_, current) => current !== index)) }
        ),
        [],
      ],
      RequestedDeleteSchedule: ({ id }) => [evo(model, { form: () => null, pendingDeleteId: () => id }), []],
      SubmittedScheduleForm: () => {
        if (model.form === null) {
          return [model, []]
        }
        const validationError = validateScheduleForm(model.form)
        if (Option.isSome(validationError)) {
          return [withForm(model, () => ({ error: validationError.value, submitting: false })), []]
        }
        const startDate = Schema.decodeUnknownOption(CalendarDate)(model.form.startDate)
        if (Option.isNone(startDate)) {
          return [withForm(model, () => ({ error: 'Enter a valid start date', submitting: false })), []]
        }
        return [
          withForm(model, () => ({ error: null, submitting: true })),
          [
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
        ]
      },
      SucceededActivateSchedule: () => refreshSchedules(model, timezone),
      SucceededDeleteSchedule: () => refreshSchedules(evo(model, { pendingDeleteId: () => null }), timezone),
      SucceededFetchNextDose: ({ nextDose, requestKey, requestedTimezone, timezone: responseTimezone }) => {
        const currentRequest = requestKey === model.nextDoseRequestKey && requestedTimezone === timezone
        if (!currentRequest) {
          return ignoreStaleNextDose(model, timezone)
        }
        if (responseTimezone !== timezone) {
          return [
            evo(model, { nextDose: () => AsyncData.Idle() }),
            [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
          ]
        }
        return [evo(model, { nextDose: () => AsyncData.succeed(Option.fromNullOr(nextDose)) }), []]
      },
      SucceededFetchSchedules: ({ schedules }) => [evo(model, { schedules: () => AsyncData.succeed(schedules) }), []],
      SucceededSaveSchedule: () => refreshSchedules(evo(model, { form: () => null }), timezone),
      ToggledSchedulePhaseIndefinite: ({ checked, index }) => [
        withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) =>
            evo(phase, {
              durationDays: () => (checked ? '' : '28'),
              isIndefinite: () => checked,
            })
          ),
        })),
        [],
      ],
    })
  )

// ============================================
// View
// ============================================

const scheduleSubmitLabel = (form: ScheduleForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }
  return form.editingId !== null ? 'Update Schedule' : 'Create Schedule'
}

const dueTextFor = (daysUntilDue: number): string => {
  if (daysUntilDue === 0) {
    return 'Due today'
  }
  if (daysUntilDue === 1) {
    return 'Due tomorrow'
  }
  if (daysUntilDue > 0) {
    return `Due in ${daysUntilDue} days`
  }
  const daysOverdue = Math.abs(daysUntilDue)
  return `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`
}

const bannerClassFor = (nextDose: NextScheduledDose): string => {
  if (nextDose.isOverdue) {
    return 'bg-destructive/10 border-destructive/20'
  }
  if (nextDose.daysUntilDue <= 1) {
    return 'bg-amber-500/10 border-amber-500/20'
  }
  return 'bg-primary/5 border-primary/20'
}

const dueClassFor = (nextDose: NextScheduledDose): string => {
  if (nextDose.isOverdue) {
    return 'text-destructive'
  }
  if (nextDose.daysUntilDue <= 1) {
    return 'text-amber-600'
  }
  return 'text-muted-foreground'
}

const totalScheduleDays = (schedule: InjectionSchedule): Option.Option<number> =>
  schedule.phases.some((phase) => phase.durationDays === null)
    ? Option.none()
    : Option.some(schedule.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0))

const makeViewSchedule = <ParentMessage>(h: HtmlBuilder<ParentMessage | ScheduleMessage>) => {
  const viewNextDoseValue = (nextDose: NextScheduledDose) =>
    h.div(
      [h.Class(`rounded-lg p-4 mb-6 border ${bannerClassFor(nextDose)}`)],
      [
        h.div(
          [h.Class('flex items-start justify-between gap-4')],
          [
            h.div(
              [h.Class('flex-1')],
              [
                h.div(
                  [h.Class('flex items-center gap-2 mb-2')],
                  [
                    h.h3([h.Class('font-semibold')], ['Next Scheduled Dose']),
                    h.span(
                      [h.Class('text-xs bg-muted px-2 py-0.5 rounded')],
                      [`Phase ${nextDose.currentPhase}/${nextDose.totalPhases}`]
                    ),
                  ]
                ),
                h.div(
                  [h.Class('flex flex-wrap items-center gap-4 text-sm')],
                  [
                    h.div(
                      [h.Class('flex items-center gap-1.5')],
                      [
                        h.span([h.Class('font-medium')], [nextDose.drug]),
                        h.span([h.Class('text-muted-foreground')], ['-']),
                        h.span([h.Class('font-mono text-primary')], [`${nextDose.doseMg} mg`]),
                      ]
                    ),
                    h.div(
                      [h.Class('flex items-center gap-1.5 text-muted-foreground')],
                      [h.span([], [formatShortDate(nextDose.suggestedDate)])]
                    ),
                    h.div(
                      [h.Class(`flex items-center gap-1.5 ${dueClassFor(nextDose)}`)],
                      [h.span([h.Class('font-medium')], [dueTextFor(nextDose.daysUntilDue)])]
                    ),
                  ]
                ),
              ]
            ),
          ]
        ),
      ]
    )

  const viewNextDoseBanner = (nextDoseData: NextDoseData) =>
    AsyncData.match(nextDoseData, {
      onFailure: () => h.div([h.Class('mb-6 text-sm text-destructive')], ['Failed to load next dose info']),
      onIdle: () => h.empty,
      onLoading: () => h.empty,
      onRefreshing: (nextDose) => Option.match(nextDose, { onNone: () => h.empty, onSome: viewNextDoseValue }),
      onStale: ({ data }) => Option.match(data, { onNone: () => h.empty, onSome: viewNextDoseValue }),
      onSuccess: (nextDose) => Option.match(nextDose, { onNone: () => h.empty, onSome: viewNextDoseValue }),
    })

  const viewScheduleCard = (schedule: InjectionSchedule) => {
    const totalDays = totalScheduleDays(schedule)
    return h.div(
      [h.Class(card({ class: `p-4 ${schedule.isActive ? 'ring-2 ring-primary' : ''}` }))],
      [
        h.div(
          [h.Class('flex items-start justify-between mb-3 gap-3')],
          [
            h.div(
              [],
              [
                h.div(
                  [h.Class('flex items-center gap-2')],
                  [
                    h.h3([h.Class('font-semibold')], [schedule.name]),
                    schedule.isActive
                      ? h.span([h.Class('text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded')], ['Active'])
                      : h.empty,
                  ]
                ),
                h.p([h.Class('text-sm text-muted-foreground')], [schedule.drug]),
                schedule.supplier === null
                  ? h.empty
                  : h.p([h.Class('text-xs text-muted-foreground')], [`Supplier: ${schedule.supplier}`]),
              ]
            ),
            h.div(
              [h.Class('flex items-center gap-1')],
              [
                schedule.isActive
                  ? h.empty
                  : h.button(
                      [
                        h.Class(button({ size: 'sm', variant: 'outline' })),
                        h.OnClick(ClickedActivateSchedule({ schedule })),
                      ],
                      ['Activate']
                    ),
                h.a(
                  [h.Href(scheduleViewRouter({ scheduleId: schedule.id }))],
                  [h.button([h.Class(button({ class: 'h-8 w-8', size: 'icon', variant: 'ghost' }))], ['View'])]
                ),
                h.button(
                  [
                    h.Class(button({ class: 'h-8 w-8', size: 'icon', variant: 'ghost' })),
                    h.OnClick(ClickedEditSchedule({ schedule })),
                  ],
                  ['Edit']
                ),
                h.button(
                  [
                    h.Class(
                      button({
                        class: 'h-8 w-8 text-destructive hover:text-destructive',
                        size: 'icon',
                        variant: 'ghost',
                      })
                    ),
                    h.OnClick(RequestedDeleteSchedule({ id: schedule.id })),
                  ],
                  ['Del']
                ),
              ]
            ),
          ]
        ),
        h.div(
          [h.Class('flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3')],
          [
            h.span([], [`Started ${formatDate(schedule.startDate)}`]),
            h.span([], [frequencyLabel(schedule.frequency)]),
            h.span(
              [],
              [Option.match(totalDays, { onNone: () => 'Indefinite', onSome: (days) => `${days} days total` })]
            ),
          ]
        ),
        h.div(
          [h.Class('space-y-1')],
          schedule.phases.map((phase) =>
            h.keyed('div')(
              phase.id,
              [h.Class('flex items-center gap-2 text-sm p-2 rounded border bg-muted/50 border-muted-foreground/20')],
              [
                h.div(
                  [
                    h.Class(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-muted text-muted-foreground'
                    ),
                  ],
                  [String(phase.order)]
                ),
                h.span([h.Class('font-mono')], [`${phase.doseMg} mg`]),
                h.span(
                  [h.Class('text-muted-foreground')],
                  [phase.durationDays !== null ? `for ${phase.durationDays} days` : '(ongoing)']
                ),
              ]
            )
          )
        ),
        schedule.notes !== null && Str.isNonEmpty(schedule.notes)
          ? h.p([h.Class('text-sm text-muted-foreground mt-3 italic')], [schedule.notes])
          : h.empty,
      ]
    )
  }

  const viewPhaseEditor = (form: ScheduleForm) =>
    h.div(
      [h.Class('mb-4')],
      [
        h.div(
          [h.Class('flex items-center justify-between mb-2')],
          [
            h.label(
              [h.Class('block text-sm font-medium')],
              ['Titration Phases ', h.span([h.Class('text-destructive')], ['*'])]
            ),
            h.button(
              [h.Class(button({ size: 'sm', variant: 'outline' })), h.Type('button'), h.OnClick(AddedSchedulePhase())],
              ['Add Phase']
            ),
          ]
        ),
        h.p(
          [h.Class('text-xs text-muted-foreground mb-3')],
          ['Define each phase of your titration schedule. Duration is in days (28 = ~1 month).']
        ),
        h.div(
          [h.Class('space-y-3')],
          form.phases.map((phase, index) =>
            h.keyed('div')(
              String(phase.order),
              [h.Class('flex flex-col gap-3 p-3 bg-muted/50 rounded-lg sm:flex-row sm:items-center')],
              [
                h.span([h.Class('text-sm font-medium text-muted-foreground w-16')], [`Phase ${index + 1}`]),
                h.div(
                  [h.Class('flex-1')],
                  [
                    h.input([
                      h.Class(input()),
                      h.Type('number'),
                      h.List('schedule-dose-mg-suggestions'),
                      h.Min('0'),
                      h.Step('any'),
                      h.Placeholder('Dose in mg (e.g., 2.5)'),
                      h.Value(phase.doseMg),
                      h.OnInput((value) => ChangedSchedulePhaseDoseMg({ index, value })),
                    ]),
                  ]
                ),
                h.div(
                  [h.Class('w-full sm:w-24')],
                  [
                    h.input([
                      h.Class(input()),
                      h.Type('number'),
                      h.Placeholder('Days'),
                      h.Min('1'),
                      h.Disabled(phase.isIndefinite),
                      h.Value(phase.durationDays),
                      h.OnInput((value) => ChangedSchedulePhaseDuration({ index, value })),
                    ]),
                  ]
                ),
                index === form.phases.length - 1
                  ? h.label(
                      [
                        h.Class(
                          'flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap'
                        ),
                        h.Title('Mark as ongoing maintenance phase with no end date'),
                      ],
                      [
                        h.input([
                          h.Class('rounded border-muted-foreground/50'),
                          h.Type('checkbox'),
                          h.Checked(phase.isIndefinite),
                          h.OnClick(ToggledSchedulePhaseIndefinite({ checked: !phase.isIndefinite, index })),
                        ]),
                        'Indefinite',
                      ]
                    )
                  : h.empty,
                form.phases.length > 1
                  ? h.button(
                      [
                        h.Class(
                          button({
                            class: 'h-8 w-8 text-destructive hover:text-destructive',
                            size: 'icon',
                            variant: 'ghost',
                          })
                        ),
                        h.Type('button'),
                        h.OnClick(RemovedSchedulePhase({ index })),
                      ],
                      ['Del']
                    )
                  : h.empty,
              ]
            )
          )
        ),
      ]
    )

  const viewForm = (form: ScheduleForm) => {
    const submitLabel = scheduleSubmitLabel(form)
    const doseMgSuggestions = (
      Schema.is(MedicationCompound)(form.drug) ? suggestedDoseMgForCompound(form.drug) : []
    ).map(String)
    const isValid =
      form.name.trim() !== '' &&
      form.drug.trim() !== '' &&
      form.startDate !== '' &&
      form.phases.every(
        (phase) => phase.doseMg.trim() !== '' && (phase.isIndefinite || phase.durationDays.trim() !== '')
      )
    return h.div(
      [h.Class(card({ class: 'mb-6 p-6' }))],
      [
        h.form(
          [h.OnSubmit(SubmittedScheduleForm())],
          [
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('schedule-name'), h.Class('mb-2 block text-sm font-medium')],
                  ['Schedule Name ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('schedule-name'),
                  h.Placeholder('e.g., Semaglutide Titration'),
                  h.Value(form.name),
                  h.OnInput((value) => ChangedScheduleName({ value })),
                ]),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label(
                  [h.For('schedule-drug'), h.Class('mb-2 block text-sm font-medium')],
                  ['Medication ', h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.select(
                  [
                    h.Class(select()),
                    h.Id('schedule-drug'),
                    h.Value(form.drug),
                    h.OnChange((value) => ChangedScheduleDrug({ value })),
                  ],
                  [
                    h.option([h.Value('')], ['Select medication']),
                    ...listMedicationCompounds().map((compound) =>
                      h.keyed('option')(compound, [h.Value(compound)], [compound])
                    ),
                  ]
                ),
              ]
            ),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('schedule-supplier'), h.Class('mb-2 block text-sm font-medium')], ['Supplier']),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('schedule-supplier'),
                  h.Placeholder('e.g., CVS, clinic, direct vendor'),
                  h.Value(form.supplier),
                  h.OnInput((value) => ChangedScheduleSupplier({ value })),
                ]),
              ]
            ),
            h.div(
              [h.Class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2')],
              [
                h.div(
                  [],
                  [
                    h.label(
                      [h.For('schedule-frequency'), h.Class('mb-2 block text-sm font-medium')],
                      ['Frequency ', h.span([h.Class('text-destructive')], ['*'])]
                    ),
                    h.select(
                      [
                        h.Class(select()),
                        h.Id('schedule-frequency'),
                        h.Value(form.frequency),
                        h.OnChange((value) => ChangedScheduleFrequency({ value: frequencyFromString(value) })),
                      ],
                      FREQUENCIES.map(([value, label]) => h.keyed('option')(value, [h.Value(value)], [label]))
                    ),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.label(
                      [h.For('schedule-start-date'), h.Class('mb-2 block text-sm font-medium')],
                      ['Start Date ', h.span([h.Class('text-destructive')], ['*'])]
                    ),
                    h.input([
                      h.Class(input()),
                      h.Type('date'),
                      h.Id('schedule-start-date'),
                      h.Value(form.startDate),
                      h.OnInput((value) => ChangedScheduleStartDate({ value })),
                    ]),
                  ]
                ),
              ]
            ),
            viewPhaseEditor(form),
            viewDatalist(h, 'schedule-dose-mg-suggestions', doseMgSuggestions),
            h.div(
              [h.Class('mb-4')],
              [
                h.label([h.For('schedule-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
                h.textarea(
                  [
                    h.Class(input({ class: 'h-auto' })),
                    h.Id('schedule-notes'),
                    h.Rows(2),
                    h.Placeholder('Any additional instructions or notes...'),
                    h.Value(form.notes),
                    h.OnInput((value) => ChangedScheduleNotes({ value })),
                  ],
                  []
                ),
              ]
            ),
            form.error === null ? h.empty : h.p([h.Class('mb-3 text-sm text-destructive')], [form.error]),
            h.div(
              [h.Class('flex justify-end gap-3')],
              [
                h.button(
                  [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelScheduleForm())],
                  ['Cancel']
                ),
                h.button([h.Class(button()), h.Type('submit'), h.Disabled(form.submitting || !isValid)], [submitLabel]),
              ]
            ),
          ]
        ),
      ]
    )
  }

  const viewDeleteConfirm = () =>
    h.div(
      [h.Class(card({ class: 'mt-4 p-4 border-destructive/40' }))],
      [
        h.div(
          [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')],
          [
            h.p([h.Class('text-sm')], ['Delete this schedule?']),
            h.div(
              [h.Class('flex gap-2')],
              [
                h.button(
                  [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(CancelledDeleteSchedule())],
                  ['Cancel']
                ),
                h.button(
                  [h.Class(button({ size: 'sm', variant: 'destructive' })), h.OnClick(ConfirmedDeleteSchedule())],
                  ['Delete']
                ),
              ]
            ),
          ]
        ),
      ]
    )

  const viewSchedules = (schedules: ReadonlyArray<InjectionSchedule>) =>
    Arr.isReadonlyArrayNonEmpty(schedules)
      ? h.div(
          [h.Class('space-y-4')],
          schedules.map((schedule) => h.keyed('div')(schedule.id, [], [viewScheduleCard(schedule)]))
        )
      : h.div(
          [h.Class(card({ class: 'p-12 text-center' }))],
          [
            h.h3([h.Class('text-lg font-medium mb-2')], ['No schedules yet']),
            h.p(
              [h.Class('text-muted-foreground mb-4')],
              ['Create your first injection schedule to track your titration phases and upcoming doses.']
            ),
            h.button([h.Class(button()), h.OnClick(ClickedAddSchedule())], ['Create Schedule']),
          ]
        )

  return (model: ScheduleModel) =>
    h.div(
      [],
      [
        viewNextDoseBanner(model.nextDose),
        h.div(
          [h.Class('flex justify-between items-center mb-6 gap-4')],
          [
            h.div(
              [],
              [
                h.h2([h.Class('text-xl font-semibold tracking-tight')], ['Injection Schedule']),
                h.p(
                  [h.Class('text-sm text-muted-foreground')],
                  ['Manage your injection schedule and titration phases']
                ),
              ]
            ),
            h.button([h.Class(button()), h.OnClick(ClickedAddSchedule())], ['New Schedule']),
          ]
        ),
        model.form === null ? h.empty : viewForm(model.form),
        AsyncData.match(model.schedules, {
          onFailure: () =>
            h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
          onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
          onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
          onRefreshing: viewSchedules,
          onStale: ({ data }) => viewSchedules(data),
          onSuccess: viewSchedules,
        }),
        model.pendingDeleteId === null ? h.empty : viewDeleteConfirm(),
      ]
    )
}

export const viewSchedule = <ParentMessage>(model: ScheduleModel, h: HtmlBuilder<ParentMessage | ScheduleMessage>) =>
  makeViewSchedule(h)(model)
