import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { ScheduleId } from '@garage/subq-domain/Journal/Journal.id'
import type { InjectionEntry, Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Order from 'effect/Order'
import * as Str from 'effect/String'

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

const makeViewInjections = <ParentMessage>(h: Html.H<ParentMessage | InjectionsMessage>) => {
  const viewDeleteConfirm = () =>
    h.div.class(card({ class: 'mb-6 p-4 border-destructive/40' })).children(
      h.div.class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between').children(
        h.p.class('text-sm').children('Delete this entry?'),
        h.div.class('flex gap-2').children(
          h.button
            .class(button({ size: 'sm', variant: 'outline' }))
            .on('click', CancelledDeleteInjection())
            .children('Cancel'),
          h.button
            .class(button({ size: 'sm', variant: 'destructive' }))
            .on('click', ConfirmedDeleteInjection())
            .children('Delete')
        )
      )
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

    return h.div.children(
      h.div.class('rounded-md border overflow-x-auto').children(
        h.table.class('w-full caption-bottom text-sm').children(
          h.thead.class('border-b').children(
            h.tr.class('text-muted-foreground').children(
              h.th.class('h-10 px-3 text-left align-middle').children(
                headerButton({
                  h,
                  label: `Date${sortIndicator(model, 'datetime')}`,
                  message: ClickedInjectionSort({ column: 'datetime' }),
                })
              ),
              h.th.class('h-10 px-3 text-left align-middle').children(
                headerButton({
                  h,
                  label: `Compound${sortIndicator(model, 'compound')}`,
                  message: ClickedInjectionSort({ column: 'compound' }),
                })
              ),
              h.th.class('h-10 px-3 text-left align-middle').children(
                headerButton({
                  h,
                  label: `Dose (mg)${sortIndicator(model, 'doseMg')}`,
                  message: ClickedInjectionSort({ column: 'doseMg' }),
                })
              ),
              h.th.class('h-10 px-3 text-left align-middle font-medium').children('Supplier'),
              h.th.class('h-10 px-3 text-left align-middle font-medium').children('Site'),
              h.th.class('h-10 px-3 text-left align-middle font-medium').children('Schedule'),
              h.th.class('h-10 px-3 text-left align-middle font-medium').children('Notes'),
              h.th.class('h-10 px-3 text-left align-middle font-medium').children('Actions')
            )
          ),
          h.tbody.children(
            Arr.map(rows, (log) =>
              h.tr
                .key(log.id)
                .class('border-b transition-colors hover:bg-muted/50')
                .children(
                  h.td.class('p-3 font-mono text-sm').children(formatDateTime(log.administeredAt, timezone)),
                  h.td.class('p-3 font-medium').children(log.compound),
                  h.td.class('p-3 font-mono').children(`${log.doseMg} mg`),
                  h.td.class('p-3 text-muted-foreground text-sm').children(log.supplier ?? '-'),
                  h.td.class('p-3 text-muted-foreground text-sm').children(log.site ?? '-'),
                  h.td.class('p-3 text-sm').children(
                    h.select
                      .class('max-w-32 rounded border bg-background p-1')
                      .attr('aria-label', 'Assign injection to schedule')
                      .value(log.scheduleId ?? '')
                      .on('change', ({ value }) =>
                        ChangedInjectionAssignment({
                          injectionId: log.id,
                          scheduleId: value === '' ? null : ScheduleId.make(value),
                        })
                      )
                      .children(
                        h.option.attr('value', '').children('Unassigned'),
                        ...Arr.map(
                          Arr.filter(
                            schedules,
                            (schedule) => schedule.compound === log.compound || schedule.id === log.scheduleId
                          ),
                          (schedule) => h.option.key(schedule.id).attr('value', schedule.id).children(schedule.name)
                        )
                      )
                  ),
                  h.td
                    .class('p-3 text-muted-foreground text-sm truncate max-w-64')
                    .attr('title', log.notes ?? '')
                    .children(log.notes ?? '-'),
                  h.td.class('p-3').children(
                    h.div.class('flex gap-2').children(
                      h.button
                        .class(button({ size: 'sm', variant: 'ghost' }))
                        .on('click', ClickedEditInjection({ log }))
                        .children('Edit'),
                      h.button
                        .class(button({ size: 'sm', variant: 'destructive' }))
                        .on('click', RequestedDeleteInjection({ id: log.id }))
                        .children('Delete')
                    )
                  )
                )
            )
          )
        )
      ),
      h.div.class('flex items-center justify-end gap-2 py-4').children(
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .disabled(page === 0)
          .on('click', ClickedInjectionPage({ delta: -1 }))
          .children('Previous'),
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .disabled(page >= pageCount - 1)
          .on('click', ClickedInjectionPage({ delta: 1 }))
          .children('Next')
      )
    )
  }

  return (model: InjectionsPage, timezone: IanaTimezone) =>
    h.div.children(
      h.div
        .class('flex justify-between items-center mb-6')
        .children(
          h.h2.class('text-xl font-semibold tracking-tight').children('Injection Log'),
          h.button.class(button()).on('click', ClickedAddInjection()).children('Add Entry')
        ),
      model.form === null ? null : viewInjectionForm({ form: model.form, h, model }),
      model.pendingDeleteId === null ? null : viewDeleteConfirm(),
      Arr.isReadonlyArrayNonEmpty(model.logs)
        ? viewTable(model, model.logs, model.schedules, timezone)
        : h.div
            .class('text-center py-12 text-muted-foreground')
            .children('No entries yet. Add your first injection log.')
    )
}

export const viewInjections = <ParentMessage>({
  model,
  timezone,
  h,
}: {
  readonly model: InjectionsPage
  readonly timezone: IanaTimezone
  readonly h: Html.H<ParentMessage | InjectionsMessage>
}): View.Content<ParentMessage | InjectionsMessage> => makeViewInjections(h)(model, timezone)
