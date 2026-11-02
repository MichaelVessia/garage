import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Order from 'effect/Order'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { IanaTimezone, WeightLog, WeightUnit } from '#shared'

import { formatWeight } from '../../data/settings.js'
import { formatDateTime } from '../../lib/datetime.js'
import { headerButton } from '../../lib/view.js'
import { button, input } from '../../ui.js'
import {
  CancelledDeleteWeight,
  ChangedWeightDatetime,
  ChangedWeightNotes,
  ChangedWeightValue,
  ClickedAddWeight,
  ClickedCancelWeightForm,
  ClickedEditWeight,
  ClickedWeightPage,
  ClickedWeightSort,
  ConfirmedDeleteWeight,
  RequestedDeleteWeight,
  SubmittedWeightForm,
} from './model.js'
import type { WeightForm, WeightMessage, WeightModel } from './model.js'

const PAGE_SIZE = 10

// ============================================
// View
// ============================================

const byWeight: Order.Order<WeightLog> = Order.mapInput(Order.Number, (log: WeightLog) => log.weight)
const byDatetime: Order.Order<WeightLog> = Order.mapInput(DateTime.Order, (log: WeightLog) => log.datetime)

const sortLogs = (
  logs: ReadonlyArray<WeightLog>,
  column: 'datetime' | 'weight',
  desc: boolean
): ReadonlyArray<WeightLog> => {
  const order = column === 'weight' ? byWeight : byDatetime

  return Arr.sort(logs, desc ? Order.flip(order) : order)
}

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

  return form.editingId === null ? 'Save' : 'Update'
}

const makeViewWeight = <ParentMessage>(h: HtmlBuilder<ParentMessage | WeightMessage>) => {
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
                h.textarea([
                  h.Class(input({ class: 'h-auto' })),
                  h.Id('weight-notes'),
                  h.Rows(2),
                  h.Placeholder('e.g., Morning weigh-in, after workout, fasted...'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedWeightNotes({ value })),
                ]),
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

  const viewTable = (model: WeightModel, logs: ReadonlyArray<WeightLog>, unit: WeightUnit, timezone: IanaTimezone) => {
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
                            headerButton({
                              h,
                              label: `Date${sortIndicator(model, 'datetime')}`,
                              message: ClickedWeightSort({ column: 'datetime' }),
                            }),
                          ]
                        ),
                        h.th(
                          [h.Class('h-10 px-3 text-left align-middle')],
                          [
                            headerButton({
                              h,
                              label: `Weight (${unit})${sortIndicator(model, 'weight')}`,
                              message: ClickedWeightSort({ column: 'weight' }),
                            }),
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
                  Arr.map(rows, (log) =>
                    h.keyed('tr')(
                      log.id,
                      [h.Class('border-b transition-colors hover:bg-muted/50')],
                      [
                        h.td([h.Class('p-3 font-mono text-sm')], [formatDateTime(log.datetime, timezone)]),
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

  return (model: WeightModel, unit: WeightUnit, timezone: IanaTimezone) =>
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
          onRefreshing: (data) => viewTable(model, data, unit, timezone),
          onStale: ({ data }) => viewTable(model, data, unit, timezone),
          onSuccess: (data) =>
            Arr.isReadonlyArrayNonEmpty(data)
              ? viewTable(model, data, unit, timezone)
              : h.div(
                  [h.Class('text-center py-12 text-muted-foreground')],
                  ['No entries yet. Add your first weight log.']
                ),
        }),
      ]
    )
}

export const viewWeight = <ParentMessage>({
  h,
  model,
  timezone,
  unit,
}: {
  readonly h: HtmlBuilder<ParentMessage | WeightMessage>
  readonly model: WeightModel
  readonly timezone: IanaTimezone
  readonly unit: WeightUnit
}): Html => makeViewWeight(h)(model, unit, timezone)
