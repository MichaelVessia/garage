import { DateTime, Effect, Match, Option, Schema } from 'effect'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import {
  Limit,
  Notes,
  Offset,
  Weight,
  WeightLog,
  WeightLogCreate,
  WeightLogId,
  WeightLogListParams,
  WeightLogUpdate,
} from '#shared'
import type { WeightUnit } from '#shared'

import { Api } from '../api.js'
import { formatWeight, toStorageLbs } from '../data/settings.js'
import {
  formatDateTime,
  fromLocalDatetimeString,
  toLocalDatetimeString,
  utcToLocalDatetimeString,
} from '../lib/datetime.js'
import { button, input } from '../ui.js'

const PAGE_SIZE = 10

// ============================================
// Model
// ============================================

export const WeightLogsData = AsyncData.Schema(Schema.Array(WeightLog), Schema.String).schema
export type WeightLogsData = AsyncData.AsyncData<ReadonlyArray<WeightLog>, string>

const WeightForm = Schema.Struct({
  editingId: Schema.NullOr(WeightLogId),
  datetime: Schema.String,
  maxDatetime: Schema.String,
  weight: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})
type WeightForm = typeof WeightForm.Type

export const WeightModel = Schema.Struct({
  logs: WeightLogsData,
  form: Schema.NullOr(WeightForm),
  pendingDeleteId: Schema.NullOr(WeightLogId),
  sortColumn: Schema.Literals(['datetime', 'weight']),
  sortDesc: Schema.Boolean,
  page: Schema.Number,
})
export type WeightModel = typeof WeightModel.Type

export const initialWeightModel: WeightModel = {
  form: null,
  logs: AsyncData.Idle(),
  page: 0,
  pendingDeleteId: null,
  sortColumn: 'datetime',
  sortDesc: true,
}

// ============================================
// Messages
// ============================================

export const SucceededFetchWeightLogs = m('SucceededFetchWeightLogs', {
  logs: Schema.Array(WeightLog),
})
export const FailedFetchWeightLogs = m('FailedFetchWeightLogs', { message: Schema.String })
export const OpenedWeightForm = m('OpenedWeightForm', {
  nowLocal: Schema.String,
  log: Schema.NullOr(WeightLog),
})
export const ClickedAddWeight = m('ClickedAddWeight')
export const ClickedEditWeight = m('ClickedEditWeight', { log: WeightLog })
export const ClickedCancelWeightForm = m('ClickedCancelWeightForm')
export const ChangedWeightDatetime = m('ChangedWeightDatetime', { value: Schema.String })
export const ChangedWeightValue = m('ChangedWeightValue', { value: Schema.String })
export const ChangedWeightNotes = m('ChangedWeightNotes', { value: Schema.String })
export const SubmittedWeightForm = m('SubmittedWeightForm', {
  unit: Schema.Literals(['lbs', 'kg']),
})
export const SucceededSaveWeight = m('SucceededSaveWeight')
export const FailedSaveWeight = m('FailedSaveWeight', { message: Schema.String })
export const RequestedDeleteWeight = m('RequestedDeleteWeight', { id: WeightLogId })
export const CancelledDeleteWeight = m('CancelledDeleteWeight')
export const ConfirmedDeleteWeight = m('ConfirmedDeleteWeight')
export const SucceededDeleteWeight = m('SucceededDeleteWeight')
export const FailedDeleteWeight = m('FailedDeleteWeight', { message: Schema.String })
export const ClickedWeightSort = m('ClickedWeightSort', {
  column: Schema.Literals(['datetime', 'weight']),
})
export const ClickedWeightPage = m('ClickedWeightPage', { delta: Schema.Number })

export const WeightMessage = Schema.Union([
  SucceededFetchWeightLogs,
  FailedFetchWeightLogs,
  OpenedWeightForm,
  ClickedAddWeight,
  ClickedEditWeight,
  ClickedCancelWeightForm,
  ChangedWeightDatetime,
  ChangedWeightValue,
  ChangedWeightNotes,
  SubmittedWeightForm,
  SucceededSaveWeight,
  FailedSaveWeight,
  RequestedDeleteWeight,
  CancelledDeleteWeight,
  ConfirmedDeleteWeight,
  SucceededDeleteWeight,
  FailedDeleteWeight,
  ClickedWeightSort,
  ClickedWeightPage,
])
export type WeightMessage = typeof WeightMessage.Type

// ============================================
// Commands
// ============================================

export const FetchWeightLogs = Command.define(
  'FetchWeightLogs',
  SucceededFetchWeightLogs,
  FailedFetchWeightLogs
)(
  Effect.gen(function* () {
    const api = yield* Api
    const logs = yield* api.WeightLogList(
      new WeightLogListParams({ limit: Limit.make(10_000), offset: Offset.make(0) })
    )
    return SucceededFetchWeightLogs({ logs })
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedFetchWeightLogs({ message: 'Failed to load weight logs' }))))
)

// Opening the form needs "now" for the datetime default and max.
export const OpenWeightForm = Command.define(
  'OpenWeightForm',
  { log: Schema.NullOr(WeightLog) },
  OpenedWeightForm
)(({ log }) =>
  DateTime.now.pipe(
    Effect.map((now) => OpenedWeightForm({ log, nowLocal: toLocalDatetimeString(DateTime.toDate(now)) }))
  )
)

export const SaveWeight = Command.define(
  'SaveWeight',
  {
    editingId: Schema.NullOr(WeightLogId),
    datetime: Schema.String,
    weightLbs: Schema.Number,
    notes: Schema.String,
  },
  SucceededSaveWeight,
  FailedSaveWeight
)(({ datetime, editingId, notes, weightLbs }) =>
  Effect.gen(function* () {
    const api = yield* Api
    const fields = {
      datetime: fromLocalDatetimeString(datetime),
      notes: notes === '' ? Option.none<Notes>() : Option.some(Notes.make(notes)),
      weight: Weight.make(weightLbs),
    }
    yield* editingId === null
      ? api.WeightLogCreate(new WeightLogCreate(fields))
      : api.WeightLogUpdate(new WeightLogUpdate({ id: editingId, ...fields }))
    return SucceededSaveWeight()
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedSaveWeight({ message: 'Failed to save entry' }))))
)

export const DeleteWeight = Command.define(
  'DeleteWeight',
  { id: WeightLogId },
  SucceededDeleteWeight,
  FailedDeleteWeight
)(({ id }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* api.WeightLogDelete({ id })
    return SucceededDeleteWeight()
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedDeleteWeight({ message: 'Failed to delete entry' }))))
)

// ============================================
// Update
// ============================================

type WeightCommandMessage =
  | typeof SucceededFetchWeightLogs.Type
  | typeof FailedFetchWeightLogs.Type
  | typeof OpenedWeightForm.Type
  | typeof SucceededSaveWeight.Type
  | typeof FailedSaveWeight.Type
  | typeof SucceededDeleteWeight.Type
  | typeof FailedDeleteWeight.Type

type UpdateReturn = readonly [WeightModel, ReadonlyArray<Command.Command<WeightCommandMessage, never, Api>>]

export const fetchWeightLogsIfIdle = (model: WeightModel): UpdateReturn =>
  AsyncData.isIdle(model.logs) ? [evo(model, { logs: () => AsyncData.Loading() }), [FetchWeightLogs()]] : [model, []]

export const updateWeight = (model: WeightModel, message: WeightMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteWeight: () => [evo(model, { pendingDeleteId: () => null }), []],
      ChangedWeightDatetime: ({ value }) => [
        evo(model, { form: (form) => (form === null ? null : evo(form, { datetime: () => value })) }),
        [],
      ],
      ChangedWeightNotes: ({ value }) => [
        evo(model, { form: (form) => (form === null ? null : evo(form, { notes: () => value })) }),
        [],
      ],
      ChangedWeightValue: ({ value }) => [
        evo(model, { form: (form) => (form === null ? null : evo(form, { weight: () => value })) }),
        [],
      ],
      ClickedAddWeight: () => [model, [OpenWeightForm({ log: null })]],
      ClickedCancelWeightForm: () => [evo(model, { form: () => null }), []],
      ClickedEditWeight: ({ log }) => [model, [OpenWeightForm({ log })]],
      ClickedWeightPage: ({ delta }) => [evo(model, { page: (page) => page + delta }), []],
      ClickedWeightSort: ({ column }) => [
        evo(model, {
          page: () => 0,
          sortColumn: () => column,
          sortDesc: (desc) => (model.sortColumn === column ? !desc : true),
        }),
        [],
      ],
      ConfirmedDeleteWeight: () =>
        model.pendingDeleteId === null ? [model, []] : [model, [DeleteWeight({ id: model.pendingDeleteId })]],
      FailedDeleteWeight: () => [evo(model, { pendingDeleteId: () => null }), []],
      FailedFetchWeightLogs: ({ message: error }) => [evo(model, { logs: () => AsyncData.Failure({ error }) }), []],
      FailedSaveWeight: ({ message: error }) => [
        evo(model, {
          form: (form) => (form === null ? null : evo(form, { error: () => error, submitting: () => false })),
        }),
        [],
      ],
      OpenedWeightForm: ({ log, nowLocal }) => [
        evo(model, {
          form: () =>
            log === null
              ? {
                  datetime: nowLocal,
                  editingId: null,
                  error: null,
                  maxDatetime: nowLocal,
                  notes: '',
                  submitting: false,
                  weight: '',
                }
              : {
                  datetime: utcToLocalDatetimeString(log.datetime),
                  editingId: log.id,
                  error: null,
                  maxDatetime: nowLocal,
                  notes: log.notes ?? '',
                  submitting: false,
                  weight: String(log.weight),
                },
          pendingDeleteId: () => null,
        }),
        [],
      ],
      RequestedDeleteWeight: ({ id }) => [evo(model, { form: () => null, pendingDeleteId: () => id }), []],
      SubmittedWeightForm: ({ unit }) => {
        if (model.form === null) {
          return [model, []]
        }
        const parsed = Number.parseFloat(model.form.weight)
        if (Number.isNaN(parsed) || parsed <= 0 || parsed > 1000) {
          return [
            evo(model, {
              form: (form) => (form === null ? null : evo(form, { error: () => 'Enter a valid weight' })),
            }),
            [],
          ]
        }
        return [
          evo(model, {
            form: (form) => (form === null ? null : evo(form, { error: () => null, submitting: () => true })),
          }),
          [
            SaveWeight({
              datetime: model.form.datetime,
              editingId: model.form.editingId,
              notes: model.form.notes,
              weightLbs: toStorageLbs(unit, parsed),
            }),
          ],
        ]
      },
      SucceededDeleteWeight: () => [
        evo(model, { logs: () => AsyncData.Loading(), pendingDeleteId: () => null }),
        [FetchWeightLogs()],
      ],
      SucceededFetchWeightLogs: ({ logs }) => [evo(model, { logs: () => AsyncData.succeed(logs) }), []],
      SucceededSaveWeight: () => [
        evo(model, { form: () => null, logs: () => AsyncData.Loading() }),
        [FetchWeightLogs()],
      ],
    })
  )

// ============================================
// View
// ============================================

const h = html<WeightMessage>()

const sortLogs = (
  logs: ReadonlyArray<WeightLog>,
  column: 'datetime' | 'weight',
  desc: boolean
): ReadonlyArray<WeightLog> =>
  logs.toSorted((a, b) => {
    const order =
      column === 'weight'
        ? a.weight - b.weight
        : DateTime.toEpochMillis(a.datetime) - DateTime.toEpochMillis(b.datetime)
    return desc ? -order : order
  })

const sortIndicator = (model: WeightModel, column: 'datetime' | 'weight'): string => {
  if (model.sortColumn !== column) {
    return ''
  }
  return model.sortDesc ? ' ↓' : ' ↑'
}

const weightSubmitLabel = (form: WeightForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }
  return form.editingId !== null ? 'Update' : 'Save'
}

const viewForm = (form: WeightForm, unit: WeightUnit) => {
  const submitLabel = weightSubmitLabel(form)
  return h.div(
    [h.Class('mb-6 p-6 rounded-lg border bg-card text-card-foreground shadow-sm')],
    [
      h.form(
        [h.OnSubmit(SubmittedWeightForm({ unit }))],
        [
          h.div(
            [h.Class('mb-4')],
            [
              h.label(
                [h.For('weight-datetime'), h.Class('mb-2 block text-sm font-medium')],
                ['Date & Time ', h.span([h.Class('text-destructive')], ['*'])]
              ),
              h.input([
                h.Class(input()),
                h.Type('datetime-local'),
                h.Id('weight-datetime'),
                h.Value(form.datetime),
                h.Max(form.maxDatetime),
                h.OnInput((value) => ChangedWeightDatetime({ value })),
              ]),
            ]
          ),
          h.div(
            [h.Class('mb-4')],
            [
              h.label(
                [h.For('weight-value'), h.Class('mb-2 block text-sm font-medium')],
                [`Weight (${unit}) `, h.span([h.Class('text-destructive')], ['*'])]
              ),
              h.input([
                h.Class(input()),
                h.Type('number'),
                h.Id('weight-value'),
                h.Step('0.1'),
                h.Min('0'),
                h.Max('1000'),
                h.Placeholder(unit === 'kg' ? 'e.g., 84.0' : 'e.g., 185.5'),
                h.Value(form.weight),
                h.OnInput((value) => ChangedWeightValue({ value })),
              ]),
            ]
          ),
          h.div(
            [h.Class('mb-5')],
            [
              h.label([h.For('weight-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
              h.textarea(
                [
                  h.Class(input({ class: 'h-auto' })),
                  h.Id('weight-notes'),
                  h.Rows(2),
                  h.Placeholder('e.g., Morning weigh-in, after workout, fasted...'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedWeightNotes({ value })),
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
                [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelWeightForm())],
                ['Cancel']
              ),
              h.button(
                [h.Class(button()), h.Type('submit'), h.Disabled(form.submitting || form.weight === '')],
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
    [h.Class('mb-6 p-4 rounded-lg border border-destructive/40 bg-card shadow-sm')],
    [
      h.div(
        [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')],
        [
          h.p([h.Class('text-sm')], ['Delete this entry?']),
          h.div(
            [h.Class('flex gap-2')],
            [
              h.button(
                [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(CancelledDeleteWeight())],
                ['Cancel']
              ),
              h.button(
                [h.Class(button({ size: 'sm', variant: 'destructive' })), h.OnClick(ConfirmedDeleteWeight())],
                ['Delete']
              ),
            ]
          ),
        ]
      ),
    ]
  )

const headerButton = (label: string, message: WeightMessage) =>
  h.button(
    [h.Class('flex items-center gap-1 text-left font-medium hover:text-foreground'), h.OnClick(message)],
    [label]
  )

const viewTable = (model: WeightModel, logs: ReadonlyArray<WeightLog>, unit: WeightUnit) => {
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
                            `Date${sortIndicator(model, 'datetime')}`,
                            ClickedWeightSort({ column: 'datetime' })
                          ),
                        ]
                      ),
                      h.th(
                        [h.Class('h-10 px-3 text-left align-middle')],
                        [
                          headerButton(
                            `Weight (${unit})${sortIndicator(model, 'weight')}`,
                            ClickedWeightSort({ column: 'weight' })
                          ),
                        ]
                      ),
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
                      h.td([h.Class('p-3 font-mono font-medium')], [formatWeight(unit, log.weight)]),
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
                                  h.OnClick(ClickedEditWeight({ log })),
                                ],
                                ['Edit']
                              ),
                              h.button(
                                [
                                  h.Class(button({ size: 'sm', variant: 'destructive' })),
                                  h.OnClick(RequestedDeleteWeight({ id: log.id })),
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
              h.OnClick(ClickedWeightPage({ delta: -1 })),
            ],
            ['Previous']
          ),
          h.button(
            [
              h.Class(button({ size: 'sm', variant: 'outline' })),
              h.Disabled(page >= pageCount - 1),
              h.OnClick(ClickedWeightPage({ delta: 1 })),
            ],
            ['Next']
          ),
        ]
      ),
    ]
  )
}

export const viewWeight = (model: WeightModel, unit: WeightUnit) =>
  h.div(
    [],
    [
      h.div(
        [h.Class('flex justify-between items-center mb-6')],
        [
          h.h2([h.Class('text-xl font-semibold tracking-tight')], ['Weight Log']),
          h.button([h.Class(button()), h.OnClick(ClickedAddWeight())], ['Add Entry']),
        ]
      ),
      model.form === null ? h.empty : viewForm(model.form, unit),
      model.pendingDeleteId === null ? h.empty : viewDeleteConfirm(),
      AsyncData.match(model.logs, {
        onFailure: () =>
          h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
        onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onRefreshing: (data) => viewTable(model, data, unit),
        onStale: ({ data }) => viewTable(model, data, unit),
        onSuccess: (data) =>
          data.length > 0
            ? viewTable(model, data, unit)
            : h.div(
                [h.Class('text-center py-12 text-muted-foreground')],
                ['No entries yet. Add your first weight log.']
              ),
      }),
    ]
  )
