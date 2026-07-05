import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import {
  Dosage,
  DrugName,
  DrugSource,
  InjectionLog,
  InjectionLogCreate,
  InjectionLogDelete,
  InjectionLogId,
  InjectionLogListParams,
  InjectionLogUpdate,
  InjectionSchedule,
  InjectionScheduleId,
  InjectionSite,
  Limit,
  Notes,
  Offset,
  listDefaultInjectionSites,
  listKnownDrugVariants,
  suggestedDosagesForDrug,
} from '#shared'

import { Api } from '../api.js'
import { toCommandResult } from '../lib/command.js'
import { formatDateTime, fromLocalDatetimeString, utcToLocalDatetimeString } from '../lib/datetime.js'
import { withForm } from '../lib/form.js'
import { headerButton, viewDatalist } from '../lib/view.js'
import { button, card, input, select } from '../ui.js'

const PAGE_SIZE = 10
const DOSAGE_PATTERN = /^\d+(\.\d+)?\s*(mg|mcg|ml|units?|iu)$/iu

// ============================================
// Model
// ============================================

export const InjectionLogsData = AsyncData.Schema(Schema.Array(InjectionLog), Schema.String).schema
export type InjectionLogsData = AsyncData.AsyncData<ReadonlyArray<InjectionLog>, string>

export const InjectionLookupData = AsyncData.Schema(Schema.Array(Schema.String), Schema.String).schema
export type InjectionLookupData = AsyncData.AsyncData<ReadonlyArray<string>, string>

export const InjectionSchedulesData = AsyncData.Schema(Schema.Array(InjectionSchedule), Schema.String).schema
export type InjectionSchedulesData = AsyncData.AsyncData<ReadonlyArray<InjectionSchedule>, string>

const InjectionForm = Schema.Struct({
  editingId: Schema.NullOr(InjectionLogId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  drug: Schema.String,
  source: Schema.String,
  dosage: Schema.String,
  injectionSite: Schema.String,
  notes: Schema.String,
  scheduleId: Schema.String,
  confirmedOffSchedule: Schema.Boolean,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})
type InjectionForm = typeof InjectionForm.Type

export const InjectionsModel = Schema.Struct({
  logs: InjectionLogsData,
  drugs: InjectionLookupData,
  sites: InjectionLookupData,
  schedules: InjectionSchedulesData,
  form: Schema.NullOr(InjectionForm),
  pendingDeleteId: Schema.NullOr(InjectionLogId),
  sortColumn: Schema.Literals(['datetime', 'drug', 'dosage']),
  sortDesc: Schema.Boolean,
  page: Schema.Number,
})
export type InjectionsModel = typeof InjectionsModel.Type

export const initialInjectionsModel: InjectionsModel = {
  drugs: AsyncData.Idle(),
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

export const SucceededFetchInjectionLogs = m('SucceededFetchInjectionLogs', {
  logs: Schema.Array(InjectionLog),
})
export const FailedFetchInjectionLogs = m('FailedFetchInjectionLogs', {
  message: Schema.String,
})
export const SucceededFetchInjectionDrugs = m('SucceededFetchInjectionDrugs', {
  drugs: Schema.Array(Schema.String),
})
export const FailedFetchInjectionDrugs = m('FailedFetchInjectionDrugs', {
  message: Schema.String,
})
export const SucceededFetchInjectionSites = m('SucceededFetchInjectionSites', {
  sites: Schema.Array(Schema.String),
})
export const FailedFetchInjectionSites = m('FailedFetchInjectionSites', {
  message: Schema.String,
})
export const SucceededFetchInjectionSchedules = m('SucceededFetchInjectionSchedules', {
  schedules: Schema.Array(InjectionSchedule),
})
export const FailedFetchInjectionSchedules = m('FailedFetchInjectionSchedules', {
  message: Schema.String,
})
export const OpenedInjectionForm = m('OpenedInjectionForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(InjectionLog),
})
export const ClickedAddInjection = m('ClickedAddInjection')
export const ClickedEditInjection = m('ClickedEditInjection', { log: InjectionLog })
export const ClickedCancelInjectionForm = m('ClickedCancelInjectionForm')
export const ChangedInjectionDatetime = m('ChangedInjectionDatetime', { value: Schema.String })
export const ChangedInjectionDrug = m('ChangedInjectionDrug', { value: Schema.String })
export const ChangedInjectionSource = m('ChangedInjectionSource', { value: Schema.String })
export const ChangedInjectionDosage = m('ChangedInjectionDosage', { value: Schema.String })
export const ChangedInjectionSite = m('ChangedInjectionSite', { value: Schema.String })
export const ChangedInjectionNotes = m('ChangedInjectionNotes', { value: Schema.String })
export const ChangedInjectionSchedule = m('ChangedInjectionSchedule', { value: Schema.String })
export const ConfirmedInjectionOffSchedule = m('ConfirmedInjectionOffSchedule')
export const SubmittedInjectionForm = m('SubmittedInjectionForm')
export const SucceededSaveInjection = m('SucceededSaveInjection')
export const FailedSaveInjection = m('FailedSaveInjection', { message: Schema.String })
export const RequestedDeleteInjection = m('RequestedDeleteInjection', { id: InjectionLogId })
export const CancelledDeleteInjection = m('CancelledDeleteInjection')
export const ConfirmedDeleteInjection = m('ConfirmedDeleteInjection')
export const SucceededDeleteInjection = m('SucceededDeleteInjection')
export const FailedDeleteInjection = m('FailedDeleteInjection', { message: Schema.String })
export const ClickedInjectionSort = m('ClickedInjectionSort', {
  column: Schema.Literals(['datetime', 'drug', 'dosage']),
})
export const ClickedInjectionPage = m('ClickedInjectionPage', { delta: Schema.Number })

export const InjectionsMessage = Schema.Union([
  SucceededFetchInjectionLogs,
  FailedFetchInjectionLogs,
  SucceededFetchInjectionDrugs,
  FailedFetchInjectionDrugs,
  SucceededFetchInjectionSites,
  FailedFetchInjectionSites,
  SucceededFetchInjectionSchedules,
  FailedFetchInjectionSchedules,
  OpenedInjectionForm,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedCancelInjectionForm,
  ChangedInjectionDatetime,
  ChangedInjectionDrug,
  ChangedInjectionSource,
  ChangedInjectionDosage,
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

// ============================================
// Commands
// ============================================

export const FetchInjectionLogs = Command.define(
  'FetchInjectionLogs',
  SucceededFetchInjectionLogs,
  FailedFetchInjectionLogs
)(
  Effect.gen(function* () {
    const api = yield* Api
    const logs = yield* api.InjectionLogList(
      new InjectionLogListParams({ limit: Limit.make(10_000), offset: Offset.make(0) })
    )
    return SucceededFetchInjectionLogs({ logs })
  }).pipe(toCommandResult(FailedFetchInjectionLogs, 'Failed to load injection logs'))
)

const FetchInjectionDrugs = Command.define(
  'FetchInjectionDrugs',
  SucceededFetchInjectionDrugs,
  FailedFetchInjectionDrugs
)(
  Effect.gen(function* () {
    const api = yield* Api
    const drugs = yield* api.InjectionLogGetDrugs()
    return SucceededFetchInjectionDrugs({ drugs })
  }).pipe(toCommandResult(FailedFetchInjectionDrugs, 'Failed to load medication suggestions'))
)

const FetchInjectionSites = Command.define(
  'FetchInjectionSites',
  SucceededFetchInjectionSites,
  FailedFetchInjectionSites
)(
  Effect.gen(function* () {
    const api = yield* Api
    const sites = yield* api.InjectionLogGetSites()
    return SucceededFetchInjectionSites({ sites })
  }).pipe(toCommandResult(FailedFetchInjectionSites, 'Failed to load site suggestions'))
)

const FetchInjectionSchedules = Command.define(
  'FetchInjectionSchedules',
  SucceededFetchInjectionSchedules,
  FailedFetchInjectionSchedules
)(
  Effect.gen(function* () {
    const api = yield* Api
    const schedules = yield* api.ScheduleList()
    return SucceededFetchInjectionSchedules({ schedules })
  }).pipe(toCommandResult(FailedFetchInjectionSchedules, 'Failed to load schedules'))
)

const OpenInjectionForm = Command.define(
  'OpenInjectionForm',
  { log: Schema.NullOr(InjectionLog) },
  OpenedInjectionForm
)(({ log }) =>
  DateTime.now.pipe(Effect.map((now) => OpenedInjectionForm({ log, nowLocal: utcToLocalDatetimeString(now) })))
)

const SaveInjection = Command.define(
  'SaveInjection',
  {
    editingId: Schema.NullOr(InjectionLogId),
    datetime: Schema.String,
    drug: Schema.String,
    source: Schema.String,
    dosage: Schema.String,
    injectionSite: Schema.String,
    notes: Schema.String,
    scheduleId: Schema.String,
  },
  SucceededSaveInjection,
  FailedSaveInjection
)(({ datetime, dosage, drug, editingId, injectionSite, notes, scheduleId, source }) =>
  Effect.gen(function* () {
    const api = yield* Api
    const fields = {
      datetime: fromLocalDatetimeString(datetime),
      dosage: Dosage.make(dosage),
      drug: DrugName.make(drug),
      injectionSite:
        injectionSite === '' ? Option.none<InjectionSite>() : Option.some(InjectionSite.make(injectionSite)),
      notes: notes === '' ? Option.none<Notes>() : Option.some(Notes.make(notes)),
      scheduleId:
        scheduleId === '' ? Option.none<InjectionScheduleId>() : Option.some(InjectionScheduleId.make(scheduleId)),
      source: source === '' ? Option.none<DrugSource>() : Option.some(DrugSource.make(source)),
    }
    yield* editingId === null
      ? api.InjectionLogCreate(new InjectionLogCreate(fields))
      : api.InjectionLogUpdate(new InjectionLogUpdate({ id: editingId, ...fields }))
    return SucceededSaveInjection()
  }).pipe(toCommandResult(FailedSaveInjection, 'Failed to save injection log'))
)

const DeleteInjection = Command.define(
  'DeleteInjection',
  { id: InjectionLogId },
  SucceededDeleteInjection,
  FailedDeleteInjection
)(({ id }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* api.InjectionLogDelete(new InjectionLogDelete({ id }))
    return SucceededDeleteInjection()
  }).pipe(toCommandResult(FailedDeleteInjection, 'Failed to delete injection log'))
)

// ============================================
// Update
// ============================================

type InjectionCommandMessage =
  | typeof SucceededFetchInjectionLogs.Type
  | typeof FailedFetchInjectionLogs.Type
  | typeof SucceededFetchInjectionDrugs.Type
  | typeof FailedFetchInjectionDrugs.Type
  | typeof SucceededFetchInjectionSites.Type
  | typeof FailedFetchInjectionSites.Type
  | typeof SucceededFetchInjectionSchedules.Type
  | typeof FailedFetchInjectionSchedules.Type
  | typeof OpenedInjectionForm.Type
  | typeof SucceededSaveInjection.Type
  | typeof FailedSaveInjection.Type
  | typeof SucceededDeleteInjection.Type
  | typeof FailedDeleteInjection.Type

type UpdateReturn = readonly [InjectionsModel, ReadonlyArray<Command.Command<InjectionCommandMessage, never, Api>>]

export const fetchInjectionsIfIdle = (model: InjectionsModel): UpdateReturn => {
  const commands: Array<Command.Command<InjectionCommandMessage, never, Api>> = []
  let next = model
  if (AsyncData.isIdle(next.logs)) {
    next = evo(next, { logs: () => AsyncData.Loading() })
    commands.push(FetchInjectionLogs())
  }
  if (AsyncData.isIdle(next.drugs)) {
    next = evo(next, { drugs: () => AsyncData.Loading() })
    commands.push(FetchInjectionDrugs())
  }
  if (AsyncData.isIdle(next.sites)) {
    next = evo(next, { sites: () => AsyncData.Loading() })
    commands.push(FetchInjectionSites())
  }
  if (AsyncData.isIdle(next.schedules)) {
    next = evo(next, { schedules: () => AsyncData.Loading() })
    commands.push(FetchInjectionSchedules())
  }
  return [next, commands]
}

const validateForm = (form: InjectionForm): Option.Option<string> => {
  if (form.datetime === '') {
    return Option.some('Date & time is required')
  }
  if (form.drug.trim().length < 2) {
    return Option.some('Enter a valid medication name')
  }
  if (!DOSAGE_PATTERN.test(form.dosage.trim())) {
    return Option.some('Enter dosage with unit (e.g., 2.5mg, 0.5ml)')
  }
  return Option.none()
}

const uniqueStrings = (primary: ReadonlyArray<string>, fallback: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.dedupe([...primary, ...fallback])

const scheduleById = (
  schedules: ReadonlyArray<InjectionSchedule>,
  scheduleId: string
): Option.Option<InjectionSchedule> => Arr.findFirst(schedules, (schedule) => schedule.id === scheduleId)

const scheduleDosages = (schedule: Option.Option<InjectionSchedule>): ReadonlyArray<string> =>
  Option.match(schedule, {
    onNone: () => [],
    onSome: (s) =>
      uniqueStrings(
        s.phases.map((phase) => phase.dosage),
        []
      ),
  })

const isOffScheduleDose = (form: InjectionForm, schedules: ReadonlyArray<InjectionSchedule>): boolean => {
  if (form.scheduleId === '' || form.dosage === '') {
    return false
  }
  const dosages = scheduleDosages(scheduleById(schedules, form.scheduleId))
  return Arr.isReadonlyArrayNonEmpty(dosages) && !dosages.includes(form.dosage)
}

export const updateInjections = (model: InjectionsModel, message: InjectionsMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteInjection: () => [evo(model, { pendingDeleteId: () => null }), []],
      ChangedInjectionDatetime: ({ value }) => [withForm(model, () => ({ datetime: value })), []],
      ChangedInjectionDosage: ({ value }) => [
        withForm(model, () => ({ confirmedOffSchedule: false, dosage: value })),
        [],
      ],
      ChangedInjectionDrug: ({ value }) => [
        withForm(model, () => ({ confirmedOffSchedule: false, drug: value, scheduleId: '' })),
        [],
      ],
      ChangedInjectionNotes: ({ value }) => [withForm(model, () => ({ notes: value })), []],
      ChangedInjectionSchedule: ({ value }) => [
        withForm(model, () => ({ confirmedOffSchedule: false, scheduleId: value })),
        [],
      ],
      ChangedInjectionSite: ({ value }) => [withForm(model, () => ({ injectionSite: value })), []],
      ChangedInjectionSource: ({ value }) => [withForm(model, () => ({ source: value })), []],
      ClickedAddInjection: () => [model, [OpenInjectionForm({ log: null })]],
      ClickedCancelInjectionForm: () => [evo(model, { form: () => null }), []],
      ClickedEditInjection: ({ log }) => [model, [OpenInjectionForm({ log })]],
      ClickedInjectionPage: ({ delta }) => [evo(model, { page: (page) => page + delta }), []],
      ClickedInjectionSort: ({ column }) => [
        evo(model, {
          page: () => 0,
          sortColumn: () => column,
          sortDesc: (desc) => (model.sortColumn === column ? !desc : true),
        }),
        [],
      ],
      ConfirmedDeleteInjection: () =>
        model.pendingDeleteId === null ? [model, []] : [model, [DeleteInjection({ id: model.pendingDeleteId })]],
      ConfirmedInjectionOffSchedule: () => [withForm(model, () => ({ confirmedOffSchedule: true })), []],
      FailedDeleteInjection: () => [evo(model, { pendingDeleteId: () => null }), []],
      FailedFetchInjectionDrugs: ({ message: error }) => [
        evo(model, { drugs: () => AsyncData.Failure({ error }) }),
        [],
      ],
      FailedFetchInjectionLogs: ({ message: error }) => [evo(model, { logs: () => AsyncData.Failure({ error }) }), []],
      FailedFetchInjectionSchedules: ({ message: error }) => [
        evo(model, { schedules: () => AsyncData.Failure({ error }) }),
        [],
      ],
      FailedFetchInjectionSites: ({ message: error }) => [
        evo(model, { sites: () => AsyncData.Failure({ error }) }),
        [],
      ],
      FailedSaveInjection: ({ message: error }) => [withForm(model, () => ({ error, submitting: false })), []],
      OpenedInjectionForm: ({ log, nowLocal }) => [
        evo(model, {
          form: () =>
            log === null
              ? {
                  confirmedOffSchedule: false,
                  datetime: nowLocal,
                  dosage: '',
                  drug: '',
                  editingId: null,
                  error: null,
                  injectionSite: '',
                  maxDatetime: nowLocal,
                  notes: '',
                  scheduleId: '',
                  source: '',
                  submitting: false,
                }
              : {
                  confirmedOffSchedule: false,
                  datetime: utcToLocalDatetimeString(log.datetime),
                  dosage: log.dosage,
                  drug: log.drug,
                  editingId: log.id,
                  error: null,
                  injectionSite: log.injectionSite ?? '',
                  maxDatetime: nowLocal,
                  notes: log.notes ?? '',
                  scheduleId: log.scheduleId ?? '',
                  source: log.source ?? '',
                  submitting: false,
                },
          pendingDeleteId: () => null,
        }),
        [],
      ],
      RequestedDeleteInjection: ({ id }) => [evo(model, { form: () => null, pendingDeleteId: () => id }), []],
      SubmittedInjectionForm: () => {
        if (model.form === null) {
          return [model, []]
        }
        const validationError = validateForm(model.form)
        if (Option.isSome(validationError)) {
          const errorMessage = validationError.value
          return [withForm(model, () => ({ error: errorMessage, submitting: false })), []]
        }
        const schedules = AsyncData.getOrElse(model.schedules, () => [])
        if (isOffScheduleDose(model.form, schedules) && !model.form.confirmedOffSchedule) {
          return [
            withForm(model, () => ({ error: 'Confirm off-schedule dosage before saving', submitting: false })),
            [],
          ]
        }
        return [
          withForm(model, () => ({ error: null, submitting: true })),
          [
            SaveInjection({
              datetime: model.form.datetime,
              dosage: model.form.dosage.trim(),
              drug: model.form.drug.trim(),
              editingId: model.form.editingId,
              injectionSite: model.form.injectionSite.trim(),
              notes: model.form.notes.trim(),
              scheduleId: model.form.scheduleId,
              source: model.form.source.trim(),
            }),
          ],
        ]
      },
      SucceededDeleteInjection: () => [
        evo(model, { logs: () => AsyncData.Loading(), pendingDeleteId: () => null }),
        [FetchInjectionLogs()],
      ],
      SucceededFetchInjectionDrugs: ({ drugs }) => [evo(model, { drugs: () => AsyncData.succeed(drugs) }), []],
      SucceededFetchInjectionLogs: ({ logs }) => [evo(model, { logs: () => AsyncData.succeed(logs) }), []],
      SucceededFetchInjectionSchedules: ({ schedules }) => [
        evo(model, { schedules: () => AsyncData.succeed(schedules) }),
        [],
      ],
      SucceededFetchInjectionSites: ({ sites }) => [evo(model, { sites: () => AsyncData.succeed(sites) }), []],
      SucceededSaveInjection: () => [
        evo(model, {
          drugs: () => AsyncData.Loading(),
          form: () => null,
          logs: () => AsyncData.Loading(),
          sites: () => AsyncData.Loading(),
        }),
        [FetchInjectionLogs(), FetchInjectionDrugs(), FetchInjectionSites()],
      ],
    })
  )

// ============================================
// View
// ============================================

const h = html<InjectionsMessage>()

const lookupValues = (data: InjectionLookupData, fallback: ReadonlyArray<string>): ReadonlyArray<string> =>
  uniqueStrings(
    AsyncData.getOrElse(data, () => []),
    fallback
  )

const sortLogs = (
  logs: ReadonlyArray<InjectionLog>,
  column: 'datetime' | 'drug' | 'dosage',
  desc: boolean
): ReadonlyArray<InjectionLog> =>
  logs.toSorted((a, b) => {
    const order =
      column === 'datetime'
        ? DateTime.toEpochMillis(a.datetime) - DateTime.toEpochMillis(b.datetime)
        : a[column].localeCompare(b[column])
    return desc ? -order : order
  })

const sortIndicator = (model: InjectionsModel, column: 'datetime' | 'drug' | 'dosage'): string => {
  if (model.sortColumn !== column) {
    return ''
  }
  return model.sortDesc ? ' ↓' : ' ↑'
}

const injectionSubmitLabel = (form: InjectionForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }
  return form.editingId !== null ? 'Update' : 'Save'
}

const selectedSchedule = (
  schedules: ReadonlyArray<InjectionSchedule>,
  form: InjectionForm
): Option.Option<InjectionSchedule> => scheduleById(schedules, form.scheduleId)

const viewOffScheduleWarning = (form: InjectionForm, schedules: ReadonlyArray<InjectionSchedule>) => {
  if (!isOffScheduleDose(form, schedules)) {
    return h.empty
  }
  const dosages = scheduleDosages(selectedSchedule(schedules, form))
  return h.div(
    [h.Class('mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg')],
    [
      h.div(
        [h.Class('flex items-start gap-2')],
        [
          h.div(
            [h.Class('flex-1')],
            [
              h.p([h.Class('text-sm font-medium text-amber-600')], ['Off-schedule dosage']),
              h.p(
                [h.Class('text-xs text-muted-foreground mt-1')],
                [`This dosage (${form.dosage}) does not match your schedule phases (${dosages.join(', ')}).`]
              ),
              form.confirmedOffSchedule
                ? h.p([h.Class('mt-1 text-xs text-amber-600')], ['Confirmed - will log as entered'])
                : h.button(
                    [
                      h.Class('mt-2 text-xs text-amber-600 hover:underline font-medium'),
                      h.Type('button'),
                      h.OnClick(ConfirmedInjectionOffSchedule()),
                    ],
                    ['Log anyway']
                  ),
            ]
          ),
        ]
      ),
    ]
  )
}

const viewForm = (model: InjectionsModel, form: InjectionForm) => {
  const schedules = AsyncData.getOrElse(model.schedules, () => [])
  const drugSuggestions = lookupValues(model.drugs, listKnownDrugVariants())
  const siteSuggestions = lookupValues(model.sites, listDefaultInjectionSites())
  const dosageSuggestions = uniqueStrings(
    scheduleDosages(selectedSchedule(schedules, form)),
    suggestedDosagesForDrug(form.drug)
  )
  const submitLabel = injectionSubmitLabel(form)
  const needsOffScheduleConfirmation = isOffScheduleDose(form, schedules) && !form.confirmedOffSchedule
  return h.div(
    [h.Class(card({ class: 'mb-6 p-6' }))],
    [
      h.form(
        [h.OnSubmit(SubmittedInjectionForm())],
        [
          h.div(
            [h.Class('mb-4')],
            [
              h.label(
                [h.For('injection-datetime'), h.Class('mb-2 block text-sm font-medium')],
                ['Date & Time ', h.span([h.Class('text-destructive')], ['*'])]
              ),
              h.input([
                h.Class(input()),
                h.Type('datetime-local'),
                h.Id('injection-datetime'),
                h.Value(form.datetime),
                h.Max(form.maxDatetime),
                h.OnInput((value) => ChangedInjectionDatetime({ value })),
              ]),
            ]
          ),
          h.div(
            [h.Class('mb-4')],
            [
              h.label(
                [h.For('injection-drug'), h.Class('mb-2 block text-sm font-medium')],
                ['Medication ', h.span([h.Class('text-destructive')], ['*'])]
              ),
              h.input([
                h.Class(input()),
                h.Type('text'),
                h.Id('injection-drug'),
                h.List('injection-drug-suggestions'),
                h.Placeholder('e.g., Semaglutide'),
                h.Value(form.drug),
                h.OnInput((value) => ChangedInjectionDrug({ value })),
              ]),
              viewDatalist(h, 'injection-drug-suggestions', drugSuggestions),
            ]
          ),
          h.div(
            [h.Class('mb-4')],
            [
              h.label([h.For('injection-schedule'), h.Class('mb-2 block text-sm font-medium')], ['Link to Schedule']),
              h.select(
                [
                  h.Class(select()),
                  h.Id('injection-schedule'),
                  h.Value(form.scheduleId),
                  h.OnChange((value) => ChangedInjectionSchedule({ value })),
                ],
                [
                  h.option([h.Value('')], ['No schedule']),
                  ...schedules.map((schedule) =>
                    h.keyed('option')(schedule.id, [h.Value(schedule.id)], [`${schedule.name} (${schedule.drug})`])
                  ),
                ]
              ),
            ]
          ),
          h.div(
            [h.Class('grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2')],
            [
              h.div(
                [],
                [
                  h.label(
                    [h.For('injection-dosage'), h.Class('mb-2 block text-sm font-medium')],
                    ['Dosage ', h.span([h.Class('text-destructive')], ['*'])]
                  ),
                  h.input([
                    h.Class(input()),
                    h.Type('text'),
                    h.Id('injection-dosage'),
                    h.List('injection-dosage-suggestions'),
                    h.Placeholder('e.g., 2.5mg'),
                    h.Value(form.dosage),
                    h.OnInput((value) => ChangedInjectionDosage({ value })),
                  ]),
                  viewDatalist(h, 'injection-dosage-suggestions', dosageSuggestions),
                ]
              ),
              h.div(
                [],
                [
                  h.label([h.For('injection-source'), h.Class('mb-2 block text-sm font-medium')], ['Source']),
                  h.input([
                    h.Class(input()),
                    h.Type('text'),
                    h.Id('injection-source'),
                    h.Placeholder('e.g., CVS, Pharmacy'),
                    h.Value(form.source),
                    h.OnInput((value) => ChangedInjectionSource({ value })),
                  ]),
                ]
              ),
            ]
          ),
          viewOffScheduleWarning(form, schedules),
          h.div(
            [h.Class('mb-4')],
            [
              h.label([h.For('injection-site'), h.Class('mb-2 block text-sm font-medium')], ['Injection Site']),
              h.input([
                h.Class(input()),
                h.Type('text'),
                h.Id('injection-site'),
                h.List('injection-site-suggestions'),
                h.Placeholder('Select site (optional)'),
                h.Value(form.injectionSite),
                h.OnInput((value) => ChangedInjectionSite({ value })),
              ]),
              viewDatalist(h, 'injection-site-suggestions', siteSuggestions),
              h.p(
                [h.Class('text-xs text-muted-foreground mt-1')],
                ['Rotating injection sites helps prevent lipodystrophy']
              ),
            ]
          ),
          h.div(
            [h.Class('mb-4')],
            [
              h.label([h.For('injection-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
              h.textarea(
                [
                  h.Class(input({ class: 'h-auto' })),
                  h.Id('injection-notes'),
                  h.Rows(2),
                  h.Placeholder('Any side effects or observations...'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedInjectionNotes({ value })),
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
                [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelInjectionForm())],
                ['Cancel']
              ),
              h.button(
                [
                  h.Class(button()),
                  h.Type('submit'),
                  h.Disabled(
                    form.submitting ||
                      form.drug.trim() === '' ||
                      form.dosage.trim() === '' ||
                      needsOffScheduleConfirmation
                  ),
                ],
                [submitLabel]
              ),
            ]
          ),
        ]
      ),
    ]
  )
}

const viewDeleteConfirm = () =>
  h.div(
    [h.Class(card({ class: 'mb-6 p-4 border-destructive/40' }))],
    [
      h.div(
        [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')],
        [
          h.p([h.Class('text-sm')], ['Delete this entry?']),
          h.div(
            [h.Class('flex gap-2')],
            [
              h.button(
                [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(CancelledDeleteInjection())],
                ['Cancel']
              ),
              h.button(
                [h.Class(button({ size: 'sm', variant: 'destructive' })), h.OnClick(ConfirmedDeleteInjection())],
                ['Delete']
              ),
            ]
          ),
        ]
      ),
    ]
  )

const scheduleName = (schedules: ReadonlyArray<InjectionSchedule>, scheduleId: Option.Option<string>): string =>
  scheduleId.pipe(
    Option.flatMap((id) => scheduleById(schedules, id)),
    Option.match({ onNone: () => '-', onSome: (schedule) => schedule.name })
  )

const viewTable = (
  model: InjectionsModel,
  logs: ReadonlyArray<InjectionLog>,
  schedules: ReadonlyArray<InjectionSchedule>
) => {
  const sorted = sortLogs(logs, model.sortColumn, model.sortDesc)
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(model.page, pageCount - 1)
  const rows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return h.div(
    [],
    [
      h.div(
        [h.Class('rounded-md border overflow-x-auto')],
        [
          h.table(
            [h.Class('w-full caption-bottom text-sm')],
            [
              h.thead(
                [h.Class('border-b')],
                [
                  h.tr(
                    [h.Class('text-muted-foreground')],
                    [
                      h.th(
                        [h.Class('h-10 px-3 text-left align-middle')],
                        [
                          headerButton(
                            h,
                            `Date${sortIndicator(model, 'datetime')}`,
                            ClickedInjectionSort({ column: 'datetime' })
                          ),
                        ]
                      ),
                      h.th(
                        [h.Class('h-10 px-3 text-left align-middle')],
                        [
                          headerButton(
                            h,
                            `Drug${sortIndicator(model, 'drug')}`,
                            ClickedInjectionSort({ column: 'drug' })
                          ),
                        ]
                      ),
                      h.th(
                        [h.Class('h-10 px-3 text-left align-middle')],
                        [
                          headerButton(
                            h,
                            `Dosage${sortIndicator(model, 'dosage')}`,
                            ClickedInjectionSort({ column: 'dosage' })
                          ),
                        ]
                      ),
                      h.th([h.Class('h-10 px-3 text-left align-middle font-medium')], ['Site']),
                      h.th([h.Class('h-10 px-3 text-left align-middle font-medium')], ['Schedule']),
                      h.th([h.Class('h-10 px-3 text-left align-middle font-medium')], ['Notes']),
                      h.th([h.Class('h-10 px-3 text-left align-middle font-medium')], ['Actions']),
                    ]
                  ),
                ]
              ),
              h.tbody(
                [],
                rows.map((log) =>
                  h.keyed('tr')(
                    log.id,
                    [h.Class('border-b transition-colors hover:bg-muted/50')],
                    [
                      h.td([h.Class('p-3 font-mono text-sm')], [formatDateTime(log.datetime)]),
                      h.td([h.Class('p-3 font-medium')], [log.drug]),
                      h.td([h.Class('p-3 font-mono')], [log.dosage]),
                      h.td([h.Class('p-3 text-muted-foreground text-sm')], [log.injectionSite ?? '-']),
                      h.td([h.Class('p-3 text-sm')], [scheduleName(schedules, Option.fromNullOr(log.scheduleId))]),
                      h.td(
                        [h.Class('p-3 text-muted-foreground text-sm truncate max-w-64'), h.Title(log.notes ?? '')],
                        [log.notes ?? '-']
                      ),
                      h.td(
                        [h.Class('p-3')],
                        [
                          h.div(
                            [h.Class('flex gap-2')],
                            [
                              h.button(
                                [
                                  h.Class(button({ size: 'sm', variant: 'ghost' })),
                                  h.OnClick(ClickedEditInjection({ log })),
                                ],
                                ['Edit']
                              ),
                              h.button(
                                [
                                  h.Class(button({ size: 'sm', variant: 'destructive' })),
                                  h.OnClick(RequestedDeleteInjection({ id: log.id })),
                                ],
                                ['Delete']
                              ),
                            ]
                          ),
                        ]
                      ),
                    ]
                  )
                )
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class('flex items-center justify-end gap-2 py-4')],
        [
          h.button(
            [
              h.Class(button({ size: 'sm', variant: 'outline' })),
              h.Disabled(page === 0),
              h.OnClick(ClickedInjectionPage({ delta: -1 })),
            ],
            ['Previous']
          ),
          h.button(
            [
              h.Class(button({ size: 'sm', variant: 'outline' })),
              h.Disabled(page >= pageCount - 1),
              h.OnClick(ClickedInjectionPage({ delta: 1 })),
            ],
            ['Next']
          ),
        ]
      ),
    ]
  )
}

export const viewInjections = (model: InjectionsModel) =>
  h.div(
    [],
    [
      h.div(
        [h.Class('flex justify-between items-center mb-6')],
        [
          h.h2([h.Class('text-xl font-semibold tracking-tight')], ['Injection Log']),
          h.button([h.Class(button()), h.OnClick(ClickedAddInjection())], ['Add Entry']),
        ]
      ),
      model.form === null ? h.empty : viewForm(model, model.form),
      model.pendingDeleteId === null ? h.empty : viewDeleteConfirm(),
      AsyncData.match(model.logs, {
        onFailure: () =>
          h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
        onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onRefreshing: (data) =>
          viewTable(
            model,
            data,
            AsyncData.getOrElse(model.schedules, () => [])
          ),
        onStale: ({ data }) =>
          viewTable(
            model,
            data,
            AsyncData.getOrElse(model.schedules, () => [])
          ),
        onSuccess: (data) =>
          Arr.isReadonlyArrayNonEmpty(data)
            ? viewTable(
                model,
                data,
                AsyncData.getOrElse(model.schedules, () => [])
              )
            : h.div(
                [h.Class('text-center py-12 text-muted-foreground')],
                ['No entries yet. Add your first injection log.']
              ),
      }),
    ]
  )
