import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import {
  Dosage,
  DrugName,
  Frequency,
  InjectionSchedule,
  InjectionScheduleCreate,
  InjectionScheduleDelete,
  InjectionScheduleId,
  InjectionScheduleUpdate,
  NextScheduledDose,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
  listKnownDrugVariants,
} from '#shared'

import { Api } from '../api.js'
import { toCommandResult } from '../lib/command.js'
import { formatDate, formatShortDate, fromLocalDateString, utcToLocalDateString } from '../lib/datetime.js'
import { withForm } from '../lib/form.js'
import { scheduleViewRouter } from '../route.js'
import { button, card, input, select } from '../ui.js'

const DOSAGE_PATTERN = /^\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)$/iu

const FREQUENCIES: ReadonlyArray<readonly [value: Frequency, label: string]> = [
  ['daily', 'Daily'],
  ['every_3_days', 'Every 3 days'],
  ['weekly', 'Weekly'],
  ['every_2_weeks', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
]

// ============================================
// Model
// ============================================

export const SchedulesData = AsyncData.Schema(Schema.Array(InjectionSchedule), Schema.String).schema
export type SchedulesData = AsyncData.AsyncData<ReadonlyArray<InjectionSchedule>, string>

export const NextDoseData = AsyncData.Schema(Schema.OptionFromNullOr(NextScheduledDose), Schema.String).schema
export type NextDoseData = AsyncData.AsyncData<Option.Option<NextScheduledDose>, string>

export const ScheduleDrugData = AsyncData.Schema(Schema.Array(Schema.String), Schema.String).schema
export type ScheduleDrugData = AsyncData.AsyncData<ReadonlyArray<string>, string>

const SchedulePhaseForm = Schema.Struct({
  order: Schema.Number,
  durationDays: Schema.String,
  dosage: Schema.String,
  isIndefinite: Schema.Boolean,
})
type SchedulePhaseForm = typeof SchedulePhaseForm.Type

const ScheduleForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionScheduleId),
  name: Schema.String,
  drug: Schema.String,
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
  drugs: ScheduleDrugData,
  form: Schema.NullOr(ScheduleForm),
  pendingDeleteId: Schema.NullOr(InjectionScheduleId),
})
export type ScheduleModel = typeof ScheduleModel.Type

export const initialScheduleModel: ScheduleModel = {
  drugs: AsyncData.Idle(),
  form: null,
  nextDose: AsyncData.Idle(),
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
})
export const FailedFetchNextDose = m('FailedFetchNextDose', { message: Schema.String })
export const SucceededFetchScheduleDrugs = m('SucceededFetchScheduleDrugs', {
  drugs: Schema.Array(Schema.String),
})
export const FailedFetchScheduleDrugs = m('FailedFetchScheduleDrugs', {
  message: Schema.String,
})
export const OpenedScheduleForm = m('OpenedScheduleForm', {
  todayLocal: Schema.String,
  schedule: Schema.NullOr(InjectionSchedule),
})
export const ClickedAddSchedule = m('ClickedAddSchedule')
export const ClickedEditSchedule = m('ClickedEditSchedule', { schedule: InjectionSchedule })
export const ClickedCancelScheduleForm = m('ClickedCancelScheduleForm')
export const ChangedScheduleName = m('ChangedScheduleName', { value: Schema.String })
export const ChangedScheduleDrug = m('ChangedScheduleDrug', { value: Schema.String })
export const ChangedScheduleFrequency = m('ChangedScheduleFrequency', { value: Frequency })
export const ChangedScheduleStartDate = m('ChangedScheduleStartDate', { value: Schema.String })
export const ChangedScheduleNotes = m('ChangedScheduleNotes', { value: Schema.String })
export const AddedSchedulePhase = m('AddedSchedulePhase')
export const RemovedSchedulePhase = m('RemovedSchedulePhase', { index: Schema.Number })
export const ChangedSchedulePhaseDosage = m('ChangedSchedulePhaseDosage', {
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
  SucceededFetchScheduleDrugs,
  FailedFetchScheduleDrugs,
  OpenedScheduleForm,
  ClickedAddSchedule,
  ClickedEditSchedule,
  ClickedCancelScheduleForm,
  ChangedScheduleName,
  ChangedScheduleDrug,
  ChangedScheduleFrequency,
  ChangedScheduleStartDate,
  ChangedScheduleNotes,
  AddedSchedulePhase,
  RemovedSchedulePhase,
  ChangedSchedulePhaseDosage,
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

export const FetchSchedules = Command.define(
  'FetchSchedules',
  SucceededFetchSchedules,
  FailedFetchSchedules
)(
  Effect.gen(function* () {
    const api = yield* Api
    const schedules = yield* api.ScheduleList()
    return SucceededFetchSchedules({ schedules })
  }).pipe(toCommandResult(FailedFetchSchedules, 'Failed to load schedules'))
)

export const FetchNextDose = Command.define(
  'FetchNextDose',
  SucceededFetchNextDose,
  FailedFetchNextDose
)(
  Effect.gen(function* () {
    const api = yield* Api
    const nextDose = yield* api.ScheduleGetNextDose()
    return SucceededFetchNextDose({ nextDose })
  }).pipe(toCommandResult(FailedFetchNextDose, 'Failed to load next dose'))
)

const FetchScheduleDrugs = Command.define(
  'FetchScheduleDrugs',
  SucceededFetchScheduleDrugs,
  FailedFetchScheduleDrugs
)(
  Effect.gen(function* () {
    const api = yield* Api
    const drugs = yield* api.InjectionLogGetDrugs()
    return SucceededFetchScheduleDrugs({ drugs })
  }).pipe(toCommandResult(FailedFetchScheduleDrugs, 'Failed to load medication suggestions'))
)

const OpenScheduleForm = Command.define(
  'OpenScheduleForm',
  { schedule: Schema.NullOr(InjectionSchedule) },
  OpenedScheduleForm
)(({ schedule }) =>
  DateTime.now.pipe(Effect.map((now) => OpenedScheduleForm({ schedule, todayLocal: utcToLocalDateString(now) })))
)

const SaveSchedule = Command.define(
  'SaveSchedule',
  {
    editingId: Schema.NullOr(InjectionScheduleId),
    name: Schema.String,
    drug: Schema.String,
    frequency: Frequency,
    startDate: Schema.String,
    notes: Schema.String,
    phases: Schema.Array(SchedulePhaseForm),
  },
  SucceededSaveSchedule,
  FailedSaveSchedule
)(({ drug, editingId, frequency, name, notes, phases, startDate }) =>
  Effect.gen(function* () {
    const api = yield* Api
    const phaseCreates = phases.map(
      (phase, index) =>
        new SchedulePhaseCreate({
          dosage: Dosage.make(phase.dosage.trim()),
          durationDays: phase.isIndefinite ? null : PhaseDurationDays.make(Number.parseInt(phase.durationDays, 10)),
          order: PhaseOrder.make(index + 1),
        })
    )
    yield* editingId === null
      ? api.ScheduleCreate(
          new InjectionScheduleCreate({
            drug: DrugName.make(drug.trim()),
            frequency,
            name: ScheduleName.make(name.trim()),
            notes: notes.trim() === '' ? Option.none<Notes>() : Option.some(Notes.make(notes.trim())),
            phases: phaseCreates,
            source: Option.none(),
            startDate: fromLocalDateString(startDate),
          })
        )
      : api.ScheduleUpdate(
          new InjectionScheduleUpdate({
            drug: DrugName.make(drug.trim()),
            frequency,
            id: editingId,
            name: ScheduleName.make(name.trim()),
            notes: notes.trim() === '' ? null : Notes.make(notes.trim()),
            phases: phaseCreates,
            source: null,
            startDate: fromLocalDateString(startDate),
          })
        )
    return SucceededSaveSchedule()
  }).pipe(toCommandResult(FailedSaveSchedule, 'Failed to save schedule'))
)

const DeleteSchedule = Command.define(
  'DeleteSchedule',
  { id: InjectionScheduleId },
  SucceededDeleteSchedule,
  FailedDeleteSchedule
)(({ id }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* api.ScheduleDelete(new InjectionScheduleDelete({ id }))
    return SucceededDeleteSchedule()
  }).pipe(toCommandResult(FailedDeleteSchedule, 'Failed to delete schedule'))
)

const ActivateSchedule = Command.define(
  'ActivateSchedule',
  { id: InjectionScheduleId },
  SucceededActivateSchedule,
  FailedActivateSchedule
)(({ id }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* api.ScheduleUpdate(new InjectionScheduleUpdate({ id, isActive: true }))
    return SucceededActivateSchedule()
  }).pipe(toCommandResult(FailedActivateSchedule, 'Failed to activate schedule'))
)

// ============================================
// Update
// ============================================

type ScheduleCommandMessage =
  | typeof SucceededFetchSchedules.Type
  | typeof FailedFetchSchedules.Type
  | typeof SucceededFetchNextDose.Type
  | typeof FailedFetchNextDose.Type
  | typeof SucceededFetchScheduleDrugs.Type
  | typeof FailedFetchScheduleDrugs.Type
  | typeof OpenedScheduleForm.Type
  | typeof SucceededSaveSchedule.Type
  | typeof FailedSaveSchedule.Type
  | typeof SucceededDeleteSchedule.Type
  | typeof FailedDeleteSchedule.Type
  | typeof SucceededActivateSchedule.Type
  | typeof FailedActivateSchedule.Type

type UpdateReturn = readonly [ScheduleModel, ReadonlyArray<Command.Command<ScheduleCommandMessage, never, Api>>]

export const fetchScheduleIfIdle = (model: ScheduleModel): UpdateReturn => {
  const commands: Array<Command.Command<ScheduleCommandMessage, never, Api>> = []
  let next = model
  if (AsyncData.isIdle(next.schedules)) {
    next = evo(next, { schedules: () => AsyncData.Loading() })
    commands.push(FetchSchedules())
  }
  if (AsyncData.isIdle(next.nextDose)) {
    next = evo(next, { nextDose: () => AsyncData.Loading() })
    commands.push(FetchNextDose())
  }
  if (AsyncData.isIdle(next.drugs)) {
    next = evo(next, { drugs: () => AsyncData.Loading() })
    commands.push(FetchScheduleDrugs())
  }
  return [next, commands]
}

const defaultPhase = (order: number): SchedulePhaseForm => ({
  dosage: '',
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

const validatePhase = (phase: SchedulePhaseForm, index: number, total: number): Option.Option<string> => {
  if (!DOSAGE_PATTERN.test(phase.dosage.trim())) {
    return Option.some(`Phase ${index + 1}: enter dosage with unit`)
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
  if (form.drug.trim() === '') {
    return Option.some('Medication is required')
  }
  if (form.startDate === '') {
    return Option.some('Start date is required')
  }
  if (Arr.isReadonlyArrayEmpty(form.phases)) {
    return Option.some('At least one phase is required')
  }
  return Arr.findFirst(form.phases, (phase, index) => validatePhase(phase, index, form.phases.length))
}

const refreshSchedules = (model: ScheduleModel): UpdateReturn => [
  evo(model, { nextDose: () => AsyncData.Loading(), schedules: () => AsyncData.Loading() }),
  [FetchSchedules(), FetchNextDose()],
]

export const updateSchedule = (model: ScheduleModel, message: ScheduleMessage): UpdateReturn =>
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
      ChangedScheduleFrequency: ({ value }) => [withForm(model, () => ({ frequency: value })), []],
      ChangedScheduleName: ({ value }) => [withForm(model, () => ({ name: value })), []],
      ChangedScheduleNotes: ({ value }) => [withForm(model, () => ({ notes: value })), []],
      ChangedSchedulePhaseDosage: ({ index, value }) => [
        withForm(model, (form) => ({
          phases: updatePhase(form.phases, index, (phase) => evo(phase, { dosage: () => value })),
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
      ClickedAddSchedule: () => [model, [OpenScheduleForm({ schedule: null })]],
      ClickedCancelScheduleForm: () => [evo(model, { form: () => null }), []],
      ClickedEditSchedule: ({ schedule }) => [model, [OpenScheduleForm({ schedule })]],
      ConfirmedDeleteSchedule: () =>
        model.pendingDeleteId === null ? [model, []] : [model, [DeleteSchedule({ id: model.pendingDeleteId })]],
      FailedActivateSchedule: () => [model, []],
      FailedDeleteSchedule: () => [evo(model, { pendingDeleteId: () => null }), []],
      FailedFetchNextDose: ({ message: error }) => [evo(model, { nextDose: () => AsyncData.Failure({ error }) }), []],
      FailedFetchScheduleDrugs: ({ message: error }) => [evo(model, { drugs: () => AsyncData.Failure({ error }) }), []],
      FailedFetchSchedules: ({ message: error }) => [evo(model, { schedules: () => AsyncData.Failure({ error }) }), []],
      FailedSaveSchedule: ({ message: error }) => [withForm(model, () => ({ error, submitting: false })), []],
      OpenedScheduleForm: ({ schedule, todayLocal }) => [
        evo(model, {
          form: () =>
            schedule === null
              ? {
                  drug: '',
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
                  editingId: schedule.id,
                  error: null,
                  frequency: schedule.frequency,
                  name: schedule.name,
                  notes: schedule.notes ?? '',
                  phases: reorderPhases(
                    schedule.phases.map((phase) => ({
                      dosage: phase.dosage,
                      durationDays: phase.durationDays === null ? '' : String(phase.durationDays),
                      isIndefinite: phase.durationDays === null,
                      order: phase.order,
                    }))
                  ),
                  startDate: utcToLocalDateString(schedule.startDate),
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
        return [
          withForm(model, () => ({ error: null, submitting: true })),
          [
            SaveSchedule({
              drug: model.form.drug,
              editingId: model.form.editingId,
              frequency: model.form.frequency,
              name: model.form.name,
              notes: model.form.notes,
              phases: model.form.phases,
              startDate: model.form.startDate,
            }),
          ],
        ]
      },
      SucceededActivateSchedule: () => refreshSchedules(model),
      SucceededDeleteSchedule: () => refreshSchedules(evo(model, { pendingDeleteId: () => null })),
      SucceededFetchNextDose: ({ nextDose }) => [
        evo(model, { nextDose: () => AsyncData.succeed(Option.fromNullOr(nextDose)) }),
        [],
      ],
      SucceededFetchScheduleDrugs: ({ drugs }) => [evo(model, { drugs: () => AsyncData.succeed(drugs) }), []],
      SucceededFetchSchedules: ({ schedules }) => [evo(model, { schedules: () => AsyncData.succeed(schedules) }), []],
      SucceededSaveSchedule: () => refreshSchedules(evo(model, { form: () => null })),
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

const h = html<ScheduleMessage>()

const frequencyLabel = (frequency: Frequency): string =>
  FREQUENCIES.find(([value]) => value === frequency)?.[1] ?? frequency

const frequencyFromString = (value: string): Frequency => {
  const frequency = FREQUENCIES.find(([candidate]) => candidate === value)
  return frequency === undefined ? 'weekly' : frequency[0]
}

const uniqueStrings = (primary: ReadonlyArray<string>, fallback: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.dedupe(Arr.appendAll(primary, fallback))

const drugSuggestions = (data: ScheduleDrugData): ReadonlyArray<string> =>
  uniqueStrings(
    AsyncData.getOrElse(data, () => []),
    listKnownDrugVariants()
  )

const scheduleSubmitLabel = (form: ScheduleForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }
  return form.editingId !== null ? 'Update Schedule' : 'Create Schedule'
}

const viewDatalist = (id: string, values: ReadonlyArray<string>) =>
  h.datalist(
    [h.Id(id)],
    values.map((value) => h.keyed('option')(value, [h.Value(value)], []))
  )

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
                      h.span([h.Class('font-mono text-primary')], [nextDose.dosage]),
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

const totalScheduleDays = (schedule: InjectionSchedule): Option.Option<number> =>
  schedule.phases.some((phase) => phase.durationDays === null)
    ? Option.none()
    : Option.some(schedule.phases.reduce((sum, phase) => sum + (phase.durationDays ?? 0), 0))

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
                    button({ class: 'h-8 w-8 text-destructive hover:text-destructive', size: 'icon', variant: 'ghost' })
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
          h.span([], [Option.match(totalDays, { onNone: () => 'Indefinite', onSome: (days) => `${days} days total` })]),
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
              h.span([h.Class('font-mono')], [phase.dosage]),
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
                    h.Type('text'),
                    h.Placeholder('Dosage (e.g., 2.5mg)'),
                    h.Value(phase.dosage),
                    h.OnInput((value) => ChangedSchedulePhaseDosage({ index, value })),
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

const viewForm = (model: ScheduleModel, form: ScheduleForm) => {
  const submitLabel = scheduleSubmitLabel(form)
  const isValid =
    form.name.trim() !== '' &&
    form.drug.trim() !== '' &&
    form.startDate !== '' &&
    form.phases.every((phase) => phase.dosage.trim() !== '' && (phase.isIndefinite || phase.durationDays.trim() !== ''))
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
              h.input([
                h.Class(input()),
                h.Type('text'),
                h.Id('schedule-drug'),
                h.List('schedule-drug-suggestions'),
                h.Placeholder('Select medication'),
                h.Value(form.drug),
                h.OnInput((value) => ChangedScheduleDrug({ value })),
              ]),
              viewDatalist('schedule-drug-suggestions', drugSuggestions(model.drugs)),
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
            [
              'Create your first injection schedule to track your titration phases and get reminders for upcoming doses.',
            ]
          ),
          h.button([h.Class(button()), h.OnClick(ClickedAddSchedule())], ['Create Schedule']),
        ]
      )

export const viewSchedule = (model: ScheduleModel) =>
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
              h.p([h.Class('text-sm text-muted-foreground')], ['Manage your injection schedule and titration phases']),
            ]
          ),
          h.button([h.Class(button()), h.OnClick(ClickedAddSchedule())], ['New Schedule']),
        ]
      ),
      model.form === null ? h.empty : viewForm(model, model.form),
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
