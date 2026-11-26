import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import type { WeightUnit } from '@garage/subq-domain/Values'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Order from 'effect/Order'

import { formatDateTime } from '../../lib/datetime.ts'
import { headerButton } from '../../lib/view.ts'
import { formatWeight } from '../../lib/weight-unit.ts'
import { button, input } from '../../ui.ts'
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
} from './model.ts'
import type { WeightForm, WeightMessage, WeightPage } from './model.ts'

const PAGE_SIZE = 10

// ============================================
// View
// ============================================

const byWeight: Order.Order<WeightEntry> = Order.mapInput(Order.Number, (log: WeightEntry) => log.weightLbs)

const byDatetime: Order.Order<WeightEntry> = Order.mapInput(DateTime.Order, (log: WeightEntry) => log.recordedAt)

const sortLogs = (
  logs: ReadonlyArray<WeightEntry>,
  column: 'datetime' | 'weight',
  desc: boolean
): ReadonlyArray<WeightEntry> => {
  const order = column === 'weight' ? byWeight : byDatetime

  return Arr.sort(logs, desc ? Order.flip(order) : order)
}

const sortIndicator = (model: WeightPage, column: 'datetime' | 'weight'): string => {
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

const makeViewWeight = <ParentMessage>(h: Html.H<ParentMessage | WeightMessage>) => {
  const viewForm = (form: WeightForm, unit: WeightUnit) => {
    const submitLabel = weightSubmitLabel(form)

    return h.div.class('mb-6 p-6 rounded-lg border bg-card text-card-foreground shadow-sm').children(
      h.form.on('submit', SubmittedWeightForm()).children(
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'weight-datetime')
            .class('mb-2 block text-sm font-medium')
            .children('Date & Time ', h.span.class('text-destructive').children('*')),
          h.input
            .class(input())
            .attr('type', 'datetime-local')
            .attr('id', 'weight-datetime')
            .value(form.datetime)
            .attr('max', form.maxDatetime)
            .on('input', ({ value }) => ChangedWeightDatetime({ value }))
        ),
        h.div.class('mb-4').children(
          h.label
            .attr('for', 'weight-value')
            .class('mb-2 block text-sm font-medium')
            .children(`Weight (${unit}) `, h.span.class('text-destructive').children('*')),
          h.input
            .class(input())
            .attr('type', 'number')
            .attr('id', 'weight-value')
            .attr('step', 'any')
            .attr('min', '0')
            .attr('max', '1000')
            .attr('placeholder', unit === 'kg' ? 'e.g., 84.0' : 'e.g., 185.5')
            .value(form.weight)
            .on('input', ({ value }) => ChangedWeightValue({ value }))
        ),
        h.div.class('mb-5').children(
          h.label.attr('for', 'weight-notes').class('mb-2 block text-sm font-medium').children('Notes'),
          h.textarea
            .class(input({ class: 'h-auto' }))
            .attr('id', 'weight-notes')
            .attr('rows', String(2))
            .attr('placeholder', 'e.g., Morning weigh-in, after workout, fasted...')
            .value(form.notes)
            .on('input', ({ value }) => ChangedWeightNotes({ value }))
        ),
        form.error === null ? null : h.p.class('mb-3 text-sm text-destructive').children(form.error),
        h.div.class('flex justify-end gap-3').children(
          h.button
            .class(button({ variant: 'outline' }))
            .attr('type', 'button')
            .on('click', ClickedCancelWeightForm())
            .children('Cancel'),
          h.button
            .class(button())
            .attr('type', 'submit')
            .disabled(form.submitting || form.weight === '')
            .children(submitLabel)
        )
      )
    )
  }

  const viewDeleteConfirm = () =>
    h.div.class('mb-6 p-4 rounded-lg border border-destructive/40 bg-card shadow-sm').children(
      h.div.class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between').children(
        h.p.class('text-sm').children('Delete this entry?'),
        h.div.class('flex gap-2').children(
          h.button
            .class(button({ size: 'sm', variant: 'outline' }))
            .on('click', CancelledDeleteWeight())
            .children('Cancel'),
          h.button
            .class(button({ size: 'sm', variant: 'destructive' }))
            .on('click', ConfirmedDeleteWeight())
            .children('Delete')
        )
      )
    )

  const viewTable = (model: WeightPage, logs: ReadonlyArray<WeightEntry>, unit: WeightUnit, timezone: IanaTimezone) => {
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
                  message: ClickedWeightSort({ column: 'datetime' }),
                })
              ),
              h.th.class('h-10 px-3 text-left align-middle').children(
                headerButton({
                  h,
                  label: `Weight (${unit})${sortIndicator(model, 'weight')}`,
                  message: ClickedWeightSort({ column: 'weight' }),
                })
              ),
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
                  h.td.class('p-3 font-mono text-sm').children(formatDateTime(log.recordedAt, timezone)),
                  h.td.class('p-3 font-mono font-medium').children(formatWeight(unit, log.weightLbs)),
                  h.td
                    .class('p-3 text-muted-foreground text-sm truncate max-w-64')
                    .attr('title', log.notes ?? '')
                    .children(log.notes ?? '-'),
                  h.td.class('p-3').children(
                    h.div.class('flex gap-2').children(
                      h.button
                        .class(button({ size: 'sm', variant: 'ghost' }))
                        .on('click', ClickedEditWeight({ log }))
                        .children('Edit'),
                      h.button
                        .class(button({ size: 'sm', variant: 'destructive' }))
                        .on('click', RequestedDeleteWeight({ id: log.id }))
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
          .on('click', ClickedWeightPage({ delta: -1 }))
          .children('Previous'),
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .disabled(page >= pageCount - 1)
          .on('click', ClickedWeightPage({ delta: 1 }))
          .children('Next')
      )
    )
  }

  return (model: WeightPage, unit: WeightUnit, timezone: IanaTimezone) =>
    h.div.children(
      h.div
        .class('flex justify-between items-center mb-6')
        .children(
          h.h2.class('text-xl font-semibold tracking-tight').children('Weight Log'),
          h.button.class(button()).on('click', ClickedAddWeight()).children('Add Entry')
        ),
      model.form === null ? null : viewForm(model.form, unit),
      model.pendingDeleteId === null ? null : viewDeleteConfirm(),
      Arr.isReadonlyArrayNonEmpty(model.logs)
        ? viewTable(model, model.logs, unit, timezone)
        : h.div.class('text-center py-12 text-muted-foreground').children('No entries yet. Add your first weight log.')
    )
}

export const viewWeight = <ParentMessage>({
  h,
  model,
  timezone,
  unit,
}: {
  readonly h: Html.H<ParentMessage | WeightMessage>
  readonly model: WeightPage
  readonly timezone: IanaTimezone
  readonly unit: WeightUnit
}): View.Content<ParentMessage | WeightMessage> => makeViewWeight(h)(model, unit, timezone)
