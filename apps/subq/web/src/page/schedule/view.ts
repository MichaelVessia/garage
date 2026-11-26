import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import type { NextScheduledDose } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'

import { formatDate, formatShortDate } from '../../lib/datetime.ts'
import { frequencyLabel } from '../../lib/frequency.ts'
import { AppRoute } from '../../route.ts'
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

const makeViewSchedule = <ParentMessage>(h: Html.H<ParentMessage | ScheduleMessage>) => {
  const viewNextDoseValue = (nextDose: NextScheduledDose) =>
    h.div
      .class(`rounded-lg p-4 mb-6 border ${bannerClassFor(nextDose)}`)
      .children(
        h.div
          .class('flex items-start justify-between gap-4')
          .children(
            h.div
              .class('flex-1')
              .children(
                h.div
                  .class('flex items-center gap-2 mb-2')
                  .children(
                    h.h3.class('font-semibold').children('Next Scheduled Dose'),
                    h.span
                      .class('text-xs bg-muted px-2 py-0.5 rounded')
                      .children(`Phase ${nextDose.currentPhase}/${nextDose.totalPhases}`)
                  ),
                h.div
                  .class('flex flex-wrap items-center gap-4 text-sm')
                  .children(
                    h.div
                      .class('flex items-center gap-1.5')
                      .children(
                        h.span.class('font-medium').children(nextDose.compound),
                        h.span.class('text-muted-foreground').children('-'),
                        h.span.class('font-mono text-primary').children(`${nextDose.doseMg} mg`)
                      ),
                    h.div
                      .class('flex items-center gap-1.5 text-muted-foreground')
                      .children(h.span.children(formatShortDate(nextDose.suggestedDate))),
                    h.div
                      .class(`flex items-center gap-1.5 ${dueClassFor(nextDose)}`)
                      .children(h.span.class('font-medium').children(dueTextFor(nextDose.daysUntilDue)))
                  )
              )
          )
      )

  const viewScheduleCard = (schedule: Schedule) => {
    const totalDays = totalScheduleDays(schedule)

    return h.div.class(card({ class: `p-4 ${schedule.isActive ? 'ring-2 ring-primary' : ''}` })).children(
      h.div.class('flex items-start justify-between mb-3 gap-3').children(
        h.div.children(
          h.div
            .class('flex items-center gap-2')
            .children(
              h.h3.class('font-semibold').children(schedule.name),
              schedule.isActive
                ? h.span.class('text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded').children('Active')
                : null
            ),
          h.p.class('text-sm text-muted-foreground').children(schedule.compound),
          schedule.supplier === null
            ? null
            : h.p.class('text-xs text-muted-foreground').children(`Supplier: ${schedule.supplier}`)
        ),
        h.div.class('flex items-center gap-1').children(
          h.button
            .class(button({ size: 'sm', variant: 'outline' }))
            .on('click', ClickedToggleScheduleActivity({ schedule }))
            .children(schedule.isActive ? 'Deactivate' : 'Activate'),
          h.a
            .attr('href', AppRoute.print(AppRoute.ScheduleView({ params: { scheduleId: schedule.id } })))
            .children(h.button.class(button({ class: 'h-8 w-8', size: 'icon', variant: 'ghost' })).children('View')),
          h.button
            .class(button({ class: 'h-8 w-8', size: 'icon', variant: 'ghost' }))
            .on('click', ClickedEditSchedule({ schedule }))
            .children('Edit'),
          h.button
            .class(
              button({
                class: 'h-8 w-8 text-destructive hover:text-destructive',
                size: 'icon',
                variant: 'ghost',
              })
            )
            .on('click', RequestedDeleteSchedule({ id: schedule.id }))
            .children('Del')
        )
      ),
      h.div
        .class('flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3')
        .children(
          h.span.children(`Started ${formatDate(schedule.startDate)}`),
          h.span.children(frequencyLabel(schedule.frequency)),
          h.span.children(
            Option.match(totalDays, { onNone: () => 'Indefinite', onSome: (days) => `${days} days total` })
          )
        ),
      h.div.class('space-y-1').children(
        Arr.map(schedule.phases, (phase) =>
          h.div
            .key(phase.id)
            .class('flex items-center gap-2 text-sm p-2 rounded border bg-muted/50 border-muted-foreground/20')
            .children(
              h.div
                .class(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-muted text-muted-foreground'
                )
                .children(String(phase.order)),
              h.span.class('font-mono').children(`${phase.doseMg} mg`),
              h.span
                .class('text-muted-foreground')
                .children(phase.durationDays === null ? '(ongoing)' : `for ${phase.durationDays} days`)
            )
        )
      ),
      schedule.notes !== null && Str.isNonEmpty(schedule.notes)
        ? h.p.class('text-sm text-muted-foreground mt-3 italic').children(schedule.notes)
        : null
    )
  }

  const viewDeleteConfirm = () =>
    h.div.class(card({ class: 'mt-4 p-4 border-destructive/40' })).children(
      h.div.class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between').children(
        h.p.class('text-sm').children('Delete this schedule?'),
        h.div.class('flex gap-2').children(
          h.button
            .class(button({ size: 'sm', variant: 'outline' }))
            .on('click', CancelledDeleteSchedule())
            .children('Cancel'),
          h.button
            .class(button({ size: 'sm', variant: 'destructive' }))
            .on('click', ConfirmedDeleteSchedule())
            .children('Delete')
        )
      )
    )

  const viewSchedules = (schedules: ReadonlyArray<Schedule>) =>
    Arr.isReadonlyArrayNonEmpty(schedules)
      ? h.div
          .class('space-y-4')
          .children(Arr.map(schedules, (schedule) => h.div.key(schedule.id).children(viewScheduleCard(schedule))))
      : h.div
          .class(card({ class: 'p-12 text-center' }))
          .children(
            h.h3.class('text-lg font-medium mb-2').children('No schedules yet'),
            h.p
              .class('text-muted-foreground mb-4')
              .children('Create your first injection schedule to track your titration phases and upcoming doses.'),
            h.button.class(button()).on('click', ClickedAddSchedule()).children('Create Schedule')
          )

  return (model: SchedulePage) =>
    h.div.children(
      Option.match(model.nextDose, { onNone: () => null, onSome: viewNextDoseValue }),
      h.div
        .class('flex justify-between items-center mb-6 gap-4')
        .children(
          h.div.children(
            h.h2.class('text-xl font-semibold tracking-tight').children('Injection Schedule'),
            h.p.class('text-sm text-muted-foreground').children('Manage your injection schedule and titration phases')
          ),
          h.button.class(button()).on('click', ClickedAddSchedule()).children('New Schedule')
        ),
      model.form === null ? null : viewScheduleForm({ form: model.form, h }),
      viewSchedules(model.schedules),
      model.pendingDeleteId === null ? null : viewDeleteConfirm()
    )
}

export const viewSchedule = <ParentMessage>({
  h,
  model,
}: {
  readonly model: SchedulePage
  readonly h: Html.H<ParentMessage | ScheduleMessage>
}): View.Content<ParentMessage | ScheduleMessage> => makeViewSchedule(h)(model)
