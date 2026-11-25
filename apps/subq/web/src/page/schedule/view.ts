import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import type { NextScheduledDose } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { formatDate, formatShortDate } from '../../lib/datetime.ts'
import { frequencyLabel } from '../../lib/frequency.ts'
import { scheduleViewRouter } from '../../route.ts'
import { button, card } from '../../ui.ts'
import { viewScheduleForm } from './form-view.ts'
import {
  CancelledDeleteSchedule,
  ClickedToggleScheduleActivity,
  ClickedAddSchedule,
  ClickedEditSchedule,
  ConfirmedDeleteSchedule,
  RequestedDeleteSchedule,
} from './model.ts'
import type { ScheduleMessage, SchedulePage } from './model.ts'

// ============================================
// View
// ============================================

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

const totalScheduleDays = (schedule: Schedule): Option.Option<number> =>
  Arr.some(schedule.phases, (phase) => phase.durationDays === null)
    ? Option.none()
    : Option.some(Arr.reduce(schedule.phases, 0, (sum, phase) => sum + (phase.durationDays ?? 0)))

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
                        h.span([h.Class('font-medium')], [nextDose.compound]),
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

  const viewScheduleCard = (schedule: Schedule) => {
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
                h.p([h.Class('text-sm text-muted-foreground')], [schedule.compound]),
                schedule.supplier === null
                  ? h.empty
                  : h.p([h.Class('text-xs text-muted-foreground')], [`Supplier: ${schedule.supplier}`]),
              ]
            ),
            h.div(
              [h.Class('flex items-center gap-1')],
              [
                h.button(
                  [
                    h.Class(button({ size: 'sm', variant: 'outline' })),
                    h.OnClick(ClickedToggleScheduleActivity({ schedule })),
                  ],
                  [schedule.isActive ? 'Deactivate' : 'Activate']
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
          Arr.map(schedule.phases, (phase) =>
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
                  [phase.durationDays === null ? '(ongoing)' : `for ${phase.durationDays} days`]
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

  const viewSchedules = (schedules: ReadonlyArray<Schedule>) =>
    Arr.isReadonlyArrayNonEmpty(schedules)
      ? h.div(
          [h.Class('space-y-4')],
          Arr.map(schedules, (schedule) => h.keyed('div')(schedule.id, [], [viewScheduleCard(schedule)]))
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

  return (model: SchedulePage) =>
    h.div(
      [],
      [
        Option.match(model.nextDose, { onNone: () => h.empty, onSome: viewNextDoseValue }),
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
        model.form === null ? h.empty : viewScheduleForm({ form: model.form, h }),
        viewSchedules(model.schedules),
        model.pendingDeleteId === null ? h.empty : viewDeleteConfirm(),
      ]
    )
}

export const viewSchedule = <ParentMessage>({
  h,
  model,
}: {
  readonly model: SchedulePage
  readonly h: HtmlBuilder<ParentMessage | ScheduleMessage>
}): Html => makeViewSchedule(h)(model)
