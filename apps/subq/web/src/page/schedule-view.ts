import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { ScheduleView } from '@garage/subq-domain/ScheduleMath'
import type { SchedulePhaseView } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { formatDate, formatDateTime, formatShortDate } from '../lib/datetime.ts'
import { frequencyLabel } from '../lib/frequency.ts'
import { scheduleRouter } from '../route.ts'
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

const makeViewScheduleView = <ParentMessage>(h: HtmlBuilder<ParentMessage>) => {
  const statusBadge = (status: SchedulePhaseView['status']) => {
    if (status === 'completed') {
      return h.span(
        [h.Class('text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-0.5 rounded')],
        ['Completed']
      )
    }

    if (status === 'current') {
      return h.span(
        [h.Class('text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded')],
        ['Current']
      )
    }

    return h.span([h.Class('text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded')], ['Upcoming'])
  }

  const viewPhaseCard = (phase: SchedulePhaseView, isLast: boolean, timezone: IanaTimezone) =>
    h.div(
      [h.Class('relative')],
      [
        isLast ? h.empty : h.div([h.Class('absolute left-6 top-full h-4 w-0.5 bg-muted-foreground/30')], []),
        h.div(
          [h.Class(card({ class: `p-4 border-2 ${statusCardClass(phase.status)}` }))],
          [
            h.div(
              [h.Class('flex items-start justify-between mb-3 gap-3')],
              [
                h.div(
                  [h.Class('flex items-center gap-3')],
                  [
                    h.div(
                      [
                        h.Class(
                          `w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${phaseCircleClass(phase.status)}`
                        ),
                      ],
                      [phase.status === 'completed' ? 'OK' : String(phase.order)]
                    ),
                    h.div(
                      [],
                      [
                        h.h3([h.Class('font-semibold')], [`Phase ${phase.order}`]),
                        h.p([h.Class('text-sm text-muted-foreground font-mono')], [`${phase.doseMg} mg`]),
                      ]
                    ),
                  ]
                ),
                statusBadge(phase.status),
              ]
            ),
            h.div(
              [h.Class('flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3')],
              [
                h.span(
                  [],
                  [
                    `${formatShortDate(phase.startDate)} - ${
                      phase.endDate === null ? 'Indefinite' : formatShortDate(phase.endDate)
                    }`,
                  ]
                ),
                h.span([], [phase.durationDays === null ? 'Indefinite' : `${phase.durationDays} days`]),
              ]
            ),
            h.div(
              [h.Class('mb-3')],
              [
                h.div(
                  [h.Class('flex items-center justify-between text-sm mb-1')],
                  [
                    h.span([h.Class('text-muted-foreground')], ['Progress']),
                    h.span(
                      [h.Class('font-medium')],
                      [
                        `${phase.completedInjections}${
                          phase.expectedInjections === null ? '' : ` / ${phase.expectedInjections}`
                        } injections`,
                      ]
                    ),
                  ]
                ),
                phase.durationDays === null
                  ? h.empty
                  : h.div(
                      [h.Class('h-2 bg-muted rounded-full overflow-hidden')],
                      [
                        h.div(
                          [
                            h.Class(`h-full transition-all ${phaseProgressClass(phase.status)}`),
                            h.Style({ width: `${progressPercent(phase)}%` }),
                          ],
                          []
                        ),
                      ]
                    ),
              ]
            ),
            Arr.isReadonlyArrayNonEmpty(phase.injections)
              ? h.div(
                  [h.Class('border-t pt-3 mt-3')],
                  [
                    h.h4([h.Class('text-sm font-medium mb-2 flex items-center gap-1')], ['Completed Injections']),
                    h.div(
                      [h.Class('space-y-1')],
                      Arr.map(phase.injections, (injection) =>
                        h.keyed('div')(
                          injection.id,
                          [h.Class('flex items-center justify-between gap-3 text-sm')],
                          [
                            h.span(
                              [h.Class('text-muted-foreground')],
                              [formatDateTime(injection.administeredAt, timezone)]
                            ),
                            h.div(
                              [h.Class('flex items-center gap-2')],
                              [
                                h.span([h.Class('font-mono')], [`${injection.doseMg} mg`]),
                                injection.site !== null && Str.isNonEmpty(injection.site)
                                  ? h.span([h.Class('text-muted-foreground text-xs')], [`@ ${injection.site}`])
                                  : h.empty,
                              ]
                            ),
                          ]
                        )
                      )
                    ),
                  ]
                )
              : h.empty,
          ]
        ),
      ]
    )

  const viewContent = (view: ScheduleView, timezone: IanaTimezone) => {
    const currentPhase = Arr.findFirst(view.phases, (phase) => phase.status === 'current')
    const completedPhases = Arr.filter(view.phases, (phase) => phase.status === 'completed').length
    const overallProgress = overallProgressPercent(view)

    return h.div(
      [],
      [
        h.div(
          [h.Class('flex items-center gap-2 mb-6')],
          [
            h.a([h.Href(scheduleRouter({})), h.Class('text-muted-foreground hover:text-foreground')], ['Back']),
            h.div(
              [],
              [
                h.h2([h.Class('text-xl font-semibold tracking-tight')], [view.name]),
                h.p([h.Class('text-sm text-muted-foreground')], [view.compound]),
                view.supplier === null
                  ? h.empty
                  : h.p([h.Class('text-xs text-muted-foreground')], [`Supplier: ${view.supplier}`]),
              ]
            ),
            view.isActive
              ? h.span([h.Class('text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded ml-2')], ['Active'])
              : h.empty,
          ]
        ),
        h.div(
          [h.Class(card({ class: 'p-6 mb-6' }))],
          [
            h.div(
              [h.Class('grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4')],
              [
                h.div(
                  [],
                  [
                    h.p([h.Class('text-sm text-muted-foreground')], ['Schedule Period']),
                    h.p(
                      [h.Class('font-medium')],
                      [
                        `${formatDate(view.startDate)} - ${view.endDate === null ? 'Indefinite' : formatDate(view.endDate)}`,
                      ]
                    ),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.p([h.Class('text-sm text-muted-foreground')], ['Frequency']),
                    h.p([h.Class('font-medium')], [frequencyLabel(view.frequency)]),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.p([h.Class('text-sm text-muted-foreground')], ['Current Phase']),
                    h.p(
                      [h.Class('font-medium')],
                      [
                        Option.match(currentPhase, {
                          onNone: () => `${completedPhases}/${view.phases.length} completed`,
                          onSome: (phase) => `Phase ${phase.order} of ${view.phases.length}`,
                        }),
                      ]
                    ),
                  ]
                ),
                h.div(
                  [],
                  [
                    h.p([h.Class('text-sm text-muted-foreground')], ['Total Injections']),
                    h.p(
                      [h.Class('font-medium')],
                      [
                        `${view.totalCompletedInjections}${
                          view.totalExpectedInjections === null ? '' : ` / ${view.totalExpectedInjections}`
                        }`,
                      ]
                    ),
                  ]
                ),
              ]
            ),
            view.endDate === null
              ? h.empty
              : h.div(
                  [h.Class('mt-4')],
                  [
                    h.div(
                      [h.Class('flex items-center justify-between text-sm mb-1')],
                      [
                        h.span([h.Class('text-muted-foreground')], ['Overall Progress']),
                        h.span([h.Class('font-medium')], [`${overallProgress}%`]),
                      ]
                    ),
                    h.div(
                      [h.Class('h-3 bg-muted rounded-full overflow-hidden')],
                      [
                        h.div(
                          [h.Class('h-full bg-primary transition-all'), h.Style({ width: `${overallProgress}%` })],
                          []
                        ),
                      ]
                    ),
                  ]
                ),
            view.notes !== null && Str.isNonEmpty(view.notes)
              ? h.p([h.Class('text-sm text-muted-foreground mt-4 italic border-t pt-4')], [view.notes])
              : h.empty,
          ]
        ),
        h.h3([h.Class('font-semibold mb-4 flex items-center gap-2')], ['Schedule Phases']),
        h.div(
          [h.Class('space-y-4')],
          Arr.map(view.phases, (phase, index) =>
            h.keyed('div')(phase.id, [], [viewPhaseCard(phase, index === view.phases.length - 1, timezone)])
          )
        ),
      ]
    )
  }

  return (model: ScheduleViewModel, timezone: IanaTimezone) =>
    Option.match(model.view, {
      onNone: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Schedule not found.']),
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
  readonly h: HtmlBuilder<ParentMessage>
}): Html => makeViewScheduleView(h)(model, timezone)
