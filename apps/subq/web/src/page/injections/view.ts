import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { ScheduleId } from '@garage/subq-domain/Journal/Journal.id'
import type { InjectionEntry, Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Order from 'effect/Order'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { formatDateTime } from '../../lib/datetime.ts'
import { headerButton } from '../../lib/view.ts'
import { button, card } from '../../ui.ts'
import { viewInjectionForm } from './form-view.ts'
import {
  CancelledDeleteInjection,
  ChangedInjectionAssignment,
  ClickedAddInjection,
  ClickedEditInjection,
  ClickedInjectionPage,
  ClickedInjectionSort,
  ConfirmedDeleteInjection,
  RequestedDeleteInjection,
} from './model.ts'
import type { InjectionsMessage, InjectionsPage } from './model.ts'

const PAGE_SIZE = 10

// ============================================
// View
// ============================================

type SortColumn = InjectionsPage['sortColumn']

const logOrder = (column: SortColumn): Order.Order<InjectionEntry> => {
  if (column === 'datetime') {
    return Order.mapInput(Order.Number, (log: InjectionEntry) => DateTime.toEpochMillis(log.administeredAt))
  }

  if (column === 'doseMg') {
    return Order.mapInput(Order.Number, (log: InjectionEntry) => log.doseMg)
  }

  return Order.make((left: InjectionEntry, right: InjectionEntry) => Str.localeCompare(right.compound)(left.compound))
}

const sortLogs = (
  logs: ReadonlyArray<InjectionEntry>,
  column: SortColumn,
  desc: boolean
): ReadonlyArray<InjectionEntry> => Arr.sort(logs, desc ? Order.flip(logOrder(column)) : logOrder(column))

const sortIndicator = (model: InjectionsPage, column: SortColumn): string => {
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

  const viewTable = (
    model: InjectionsPage,
    logs: ReadonlyArray<InjectionEntry>,
    schedules: ReadonlyArray<Schedule>,
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
                              label: `Compound${sortIndicator(model, 'compound')}`,
                              message: ClickedInjectionSort({ column: 'compound' }),
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
                        h.td([h.Class('p-3 font-mono text-sm')], [formatDateTime(log.administeredAt, timezone)]),
                        h.td([h.Class('p-3 font-medium')], [log.compound]),
                        h.td([h.Class('p-3 font-mono')], [`${log.doseMg} mg`]),
                        h.td([h.Class('p-3 text-muted-foreground text-sm')], [log.supplier ?? '-']),
                        h.td([h.Class('p-3 text-muted-foreground text-sm')], [log.site ?? '-']),
                        h.td(
                          [h.Class('p-3 text-sm')],
                          [
                            h.select(
                              [
                                h.Class('max-w-32 rounded border bg-background p-1'),
                                h.AriaLabel('Assign injection to schedule'),
                                h.Value(log.scheduleId ?? ''),
                                h.OnChange((value) =>
                                  ChangedInjectionAssignment({
                                    injectionId: log.id,
                                    scheduleId: value === '' ? null : ScheduleId.make(value),
                                  })
                                ),
                              ],
                              [
                                h.option([h.Value('')], ['Unassigned']),
                                ...Arr.map(
                                  Arr.filter(
                                    schedules,
                                    (schedule) => schedule.compound === log.compound || schedule.id === log.scheduleId
                                  ),
                                  (schedule) => h.keyed('option')(schedule.id, [h.Value(schedule.id)], [schedule.name])
                                ),
                              ]
                            ),
                          ]
                        ),
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

  return (model: InjectionsPage, timezone: IanaTimezone) =>
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
        Arr.isReadonlyArrayNonEmpty(model.logs)
          ? viewTable(model, model.logs, model.schedules, timezone)
          : h.div(
              [h.Class('text-center py-12 text-muted-foreground')],
              ['No entries yet. Add your first injection log.']
            ),
      ]
    )
}

export const viewInjections = <ParentMessage>({
  model,
  timezone,
  h,
}: {
  readonly model: InjectionsPage
  readonly timezone: IanaTimezone
  readonly h: HtmlBuilder<ParentMessage | InjectionsMessage>
}): Html => makeViewInjections(h)(model, timezone)
