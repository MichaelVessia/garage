import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Str from 'effect/String'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { IanaTimezone, InjectionLog, InjectionSchedule } from '#shared'

import { formatDateTime } from '../../lib/datetime.js'
import { headerButton } from '../../lib/view.js'
import { button, card } from '../../ui.js'
import { viewInjectionForm } from './form-view.js'
import { scheduleById } from './form.js'
import {
  CancelledDeleteInjection,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedInjectionPage,
  ClickedInjectionSort,
  ConfirmedDeleteInjection,
  RequestedDeleteInjection,
} from './model.js'
import type { InjectionsMessage, InjectionsModel } from './model.js'

const PAGE_SIZE = 10

// ============================================
// View
// ============================================

type SortColumn = InjectionsModel['sortColumn']

const logOrder = (column: SortColumn): Order.Order<InjectionLog> => {
  if (column === 'datetime') {
    return Order.mapInput(Order.Number, (log: InjectionLog) => DateTime.toEpochMillis(log.datetime))
  }

  if (column === 'doseMg') {
    return Order.mapInput(Order.Number, (log: InjectionLog) => log.doseMg)
  }

  return Order.make((left: InjectionLog, right: InjectionLog) => Str.localeCompare(right.drug)(left.drug))
}

const sortLogs = (logs: ReadonlyArray<InjectionLog>, column: SortColumn, desc: boolean): ReadonlyArray<InjectionLog> =>
  Arr.sort(logs, desc ? Order.flip(logOrder(column)) : logOrder(column))

const sortIndicator = (model: InjectionsModel, column: SortColumn): string => {
  if (model.sortColumn !== column) {
    return ''
  }

  return model.sortDesc ? ' ↓' : ' ↑'
}

const makeViewInjections = <ParentMessage>(h: HtmlBuilder<ParentMessage | InjectionsMessage>) => {
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
    schedules: ReadonlyArray<InjectionSchedule>,
    timezone: IanaTimezone
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
                            headerButton({
                              h,
                              label: `Date${sortIndicator(model, 'datetime')}`,
                              message: ClickedInjectionSort({ column: 'datetime' }),
                            }),
                          ]
                        ),
                        h.th(
                          [h.Class('h-10 px-3 text-left align-middle')],
                          [
                            headerButton({
                              h,
                              label: `Compound${sortIndicator(model, 'drug')}`,
                              message: ClickedInjectionSort({ column: 'drug' }),
                            }),
                          ]
                        ),
                        h.th(
                          [h.Class('h-10 px-3 text-left align-middle')],
                          [
                            headerButton({
                              h,
                              label: `Dose (mg)${sortIndicator(model, 'doseMg')}`,
                              message: ClickedInjectionSort({ column: 'doseMg' }),
                            }),
                          ]
                        ),
                        h.th([h.Class('h-10 px-3 text-left align-middle font-medium')], ['Supplier']),
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
                  Arr.map(rows, (log) =>
                    h.keyed('tr')(
                      log.id,
                      [h.Class('border-b transition-colors hover:bg-muted/50')],
                      [
                        h.td([h.Class('p-3 font-mono text-sm')], [formatDateTime(log.datetime, timezone)]),
                        h.td([h.Class('p-3 font-medium')], [log.drug]),
                        h.td([h.Class('p-3 font-mono')], [`${log.doseMg} mg`]),
                        h.td([h.Class('p-3 text-muted-foreground text-sm')], [log.supplier ?? '-']),
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

  return (model: InjectionsModel, timezone: IanaTimezone) =>
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
        model.form === null ? h.empty : viewInjectionForm({ form: model.form, h, model }),
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
              AsyncData.getOrElse(model.schedules, () => []),
              timezone
            ),
          onStale: ({ data }) =>
            viewTable(
              model,
              data,
              AsyncData.getOrElse(model.schedules, () => []),
              timezone
            ),
          onSuccess: (data) =>
            Arr.isReadonlyArrayNonEmpty(data)
              ? viewTable(
                  model,
                  data,
                  AsyncData.getOrElse(model.schedules, () => []),
                  timezone
                )
              : h.div(
                  [h.Class('text-center py-12 text-muted-foreground')],
                  ['No entries yet. Add your first injection log.']
                ),
        }),
      ]
    )
}

export const viewInjections = <ParentMessage>({
  model,
  timezone,
  h,
}: {
  readonly model: InjectionsModel
  readonly timezone: IanaTimezone
  readonly h: HtmlBuilder<ParentMessage | InjectionsMessage>
}): Html => makeViewInjections(h)(model, timezone)
