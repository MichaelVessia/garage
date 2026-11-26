import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { ScheduleView } from '@garage/subq-domain/ScheduleMath'
import type { SchedulePhaseView } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'

import { formatDate, formatDateTime, formatShortDate } from '../lib/datetime.ts'
import { frequencyLabel } from '../lib/frequency.ts'
import { AppRoute } from '../route.ts'
import { card } from '../ui.ts'

type ScheduleViewModel = Readonly<{ view: Option.Option<ScheduleView> }>

const phaseCircleClass = (status: SchedulePhaseView['status']): string => {
  if (status === 'completed') {
    return 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
  }

  if (status === 'current') {
    return 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
  }

  return 'bg-muted text-muted-foreground'
}

const phaseProgressClass = (status: SchedulePhaseView['status']): string => {
  if (status === 'completed') {
    return 'bg-green-500'
  }

  if (status === 'current') {
    return 'bg-blue-500'
  }

  return 'bg-muted-foreground/30'
}

const statusCardClass = (status: SchedulePhaseView['status']): string => {
  if (status === 'completed') {
    return 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700'
  }

  if (status === 'current') {
    return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700'
  }

  return 'bg-muted border-muted-foreground/20'
}

const progressPercent = (phase: SchedulePhaseView): number =>
  phase.durationDays !== null && phase.expectedInjections !== null && phase.expectedInjections > 0
    ? Math.round((phase.completedInjections / phase.expectedInjections) * 100)
    : 0

const overallProgressPercent = (view: ScheduleView): number =>
  view.endDate !== null && view.totalExpectedInjections !== null && view.totalExpectedInjections > 0
    ? Math.round((view.totalCompletedInjections / view.totalExpectedInjections) * 100)
    : 0

const makeViewScheduleView = <ParentMessage>(h: Html.H<ParentMessage>) => {
  const statusBadge = (status: SchedulePhaseView['status']) => {
    if (status === 'completed') {
      return h.span
        .class('text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-0.5 rounded')
        .children('Completed')
    }

    if (status === 'current') {
      return h.span
        .class('text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded')
        .children('Current')
    }

    return h.span.class('text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded').children('Upcoming')
  }

  const viewPhaseCard = (phase: SchedulePhaseView, isLast: boolean, timezone: IanaTimezone) =>
    h.div.class('relative').children(
      isLast ? null : h.div.class('absolute left-6 top-full h-4 w-0.5 bg-muted-foreground/30'),
      h.div.class(card({ class: `p-4 border-2 ${statusCardClass(phase.status)}` })).children(
        h.div
          .class('flex items-start justify-between mb-3 gap-3')
          .children(
            h.div
              .class('flex items-center gap-3')
              .children(
                h.div
                  .class(
                    `w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${phaseCircleClass(phase.status)}`
                  )
                  .children(phase.status === 'completed' ? 'OK' : String(phase.order)),
                h.div.children(
                  h.h3.class('font-semibold').children(`Phase ${phase.order}`),
                  h.p.class('text-sm text-muted-foreground font-mono').children(`${phase.doseMg} mg`)
                )
              ),
            statusBadge(phase.status)
          ),
        h.div
          .class('flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3')
          .children(
            h.span.children(
              `${formatShortDate(phase.startDate)} - ${
                phase.endDate === null ? 'Indefinite' : formatShortDate(phase.endDate)
              }`
            ),
            h.span.children(phase.durationDays === null ? 'Indefinite' : `${phase.durationDays} days`)
          ),
        h.div
          .class('mb-3')
          .children(
            h.div
              .class('flex items-center justify-between text-sm mb-1')
              .children(
                h.span.class('text-muted-foreground').children('Progress'),
                h.span
                  .class('font-medium')
                  .children(
                    `${phase.completedInjections}${
                      phase.expectedInjections === null ? '' : ` / ${phase.expectedInjections}`
                    } injections`
                  )
              ),
            phase.durationDays === null
              ? null
              : h.div
                  .class('h-2 bg-muted rounded-full overflow-hidden')
                  .children(
                    h.div
                      .class(`h-full transition-all ${phaseProgressClass(phase.status)}`)
                      .style({ width: `${progressPercent(phase)}%` })
                  )
          ),
        Arr.isReadonlyArrayNonEmpty(phase.injections)
          ? h.div.class('border-t pt-3 mt-3').children(
              h.h4.class('text-sm font-medium mb-2 flex items-center gap-1').children('Completed Injections'),
              h.div.class('space-y-1').children(
                Arr.map(phase.injections, (injection) =>
                  h.div
                    .key(injection.id)
                    .class('flex items-center justify-between gap-3 text-sm')
                    .children(
                      h.span
                        .class('text-muted-foreground')
                        .children(formatDateTime(injection.administeredAt, timezone)),
                      h.div
                        .class('flex items-center gap-2')
                        .children(
                          h.span.class('font-mono').children(`${injection.doseMg} mg`),
                          injection.site !== null && Str.isNonEmpty(injection.site)
                            ? h.span.class('text-muted-foreground text-xs').children(`@ ${injection.site}`)
                            : null
                        )
                    )
                )
              )
            )
          : null
      )
    )

  const viewContent = (view: ScheduleView, timezone: IanaTimezone) => {
    const currentPhase = Arr.findFirst(view.phases, (phase) => phase.status === 'current')
    const completedPhases = Arr.filter(view.phases, (phase) => phase.status === 'completed').length
    const overallProgress = overallProgressPercent(view)

    return h.div.children(
      h.div
        .class('flex items-center gap-2 mb-6')
        .children(
          h.a
            .attr('href', AppRoute.print(AppRoute.Schedule()))
            .class('text-muted-foreground hover:text-foreground')
            .children('Back'),
          h.div.children(
            h.h2.class('text-xl font-semibold tracking-tight').children(view.name),
            h.p.class('text-sm text-muted-foreground').children(view.compound),
            view.supplier === null
              ? null
              : h.p.class('text-xs text-muted-foreground').children(`Supplier: ${view.supplier}`)
          ),
          view.isActive
            ? h.span.class('text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded ml-2').children('Active')
            : null
        ),
      h.div.class(card({ class: 'p-6 mb-6' })).children(
        h.div.class('grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4').children(
          h.div.children(
            h.p.class('text-sm text-muted-foreground').children('Schedule Period'),
            h.p
              .class('font-medium')
              .children(
                `${formatDate(view.startDate)} - ${view.endDate === null ? 'Indefinite' : formatDate(view.endDate)}`
              )
          ),
          h.div.children(
            h.p.class('text-sm text-muted-foreground').children('Frequency'),
            h.p.class('font-medium').children(frequencyLabel(view.frequency))
          ),
          h.div.children(
            h.p.class('text-sm text-muted-foreground').children('Current Phase'),
            h.p.class('font-medium').children(
              Option.match(currentPhase, {
                onNone: () => `${completedPhases}/${view.phases.length} completed`,
                onSome: (phase) => `Phase ${phase.order} of ${view.phases.length}`,
              })
            )
          ),
          h.div.children(
            h.p.class('text-sm text-muted-foreground').children('Total Injections'),
            h.p
              .class('font-medium')
              .children(
                `${view.totalCompletedInjections}${
                  view.totalExpectedInjections === null ? '' : ` / ${view.totalExpectedInjections}`
                }`
              )
          )
        ),
        view.endDate === null
          ? null
          : h.div
              .class('mt-4')
              .children(
                h.div
                  .class('flex items-center justify-between text-sm mb-1')
                  .children(
                    h.span.class('text-muted-foreground').children('Overall Progress'),
                    h.span.class('font-medium').children(`${overallProgress}%`)
                  ),
                h.div
                  .class('h-3 bg-muted rounded-full overflow-hidden')
                  .children(h.div.class('h-full bg-primary transition-all').style({ width: `${overallProgress}%` }))
              ),
        view.notes !== null && Str.isNonEmpty(view.notes)
          ? h.p.class('text-sm text-muted-foreground mt-4 italic border-t pt-4').children(view.notes)
          : null
      ),
      h.h3.class('font-semibold mb-4 flex items-center gap-2').children('Schedule Phases'),
      h.div
        .class('space-y-4')
        .children(
          Arr.map(view.phases, (phase, index) =>
            h.div.key(phase.id).children(viewPhaseCard(phase, index === view.phases.length - 1, timezone))
          )
        )
    )
  }

  return (model: ScheduleViewModel, timezone: IanaTimezone) =>
    Option.match(model.view, {
      onNone: () => h.div.class('text-center py-12 text-muted-foreground').children('Schedule not found.'),
      onSome: (found) => viewContent(found, timezone),
    })
}

export const viewScheduleView = <ParentMessage>({
  h,
  model,
  timezone,
}: {
  readonly model: ScheduleViewModel
  readonly timezone: IanaTimezone
  readonly h: Html.H<ParentMessage>
}): View.Content<ParentMessage> => makeViewScheduleView(h)(model, timezone)
