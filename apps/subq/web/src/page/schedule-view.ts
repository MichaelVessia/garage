import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import type { HtmlBuilder } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { InjectionScheduleId, ScheduleView } from '#shared'
import type { IanaTimezone, SchedulePhaseView } from '#shared'

import { Api } from '../api.js'
import { toCommandResult } from '../lib/command.js'
import { formatDate, formatDateTime, formatShortDate } from '../lib/datetime.js'
import { frequencyLabel } from '../lib/frequency.js'
import { scheduleRouter } from '../route.js'
import { card } from '../ui.js'

// ============================================
// Model
// ============================================

export const ScheduleViewData = AsyncData.Schema(Schema.OptionFromNullOr(ScheduleView), Schema.String).schema
export type ScheduleViewData = AsyncData.AsyncData<Option.Option<ScheduleView>, string>

export const ScheduleViewModel = Schema.Struct({
  scheduleId: Schema.NullOr(Schema.String),
  view: ScheduleViewData,
})
export type ScheduleViewModel = typeof ScheduleViewModel.Type

export const initialScheduleViewModel: ScheduleViewModel = {
  scheduleId: null,
  view: AsyncData.Idle(),
}

// ============================================
// Messages
// ============================================

export const SucceededFetchScheduleView = m('SucceededFetchScheduleView', {
  view: Schema.NullOr(ScheduleView),
})
export const FailedFetchScheduleView = m('FailedFetchScheduleView', { message: Schema.String })

export const ScheduleViewMessage = Schema.Union([SucceededFetchScheduleView, FailedFetchScheduleView])
export type ScheduleViewMessage = typeof ScheduleViewMessage.Type

// ============================================
// Commands
// ============================================

const FetchScheduleView = Command.define('FetchScheduleView', {
  args: { scheduleId: Schema.String },
  messages: [SucceededFetchScheduleView, FailedFetchScheduleView],
  execute: ({ scheduleId }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const view = yield* api.ScheduleGetView({ id: InjectionScheduleId.make(scheduleId) })
      return SucceededFetchScheduleView({ view })
    }).pipe(toCommandResult(FailedFetchScheduleView, 'Failed to load schedule')),
})

// ============================================
// Update
// ============================================

type ScheduleViewCommandMessage = typeof SucceededFetchScheduleView.Type | typeof FailedFetchScheduleView.Type

type UpdateReturn = readonly [ScheduleViewModel, ReadonlyArray<Command.Command<ScheduleViewCommandMessage, never, Api>>]

export const fetchScheduleView = (model: ScheduleViewModel, scheduleId: string): UpdateReturn =>
  model.scheduleId !== scheduleId || AsyncData.isIdle(model.view)
    ? [
        evo(model, {
          scheduleId: () => scheduleId,
          view: () => AsyncData.Loading(),
        }),
        [FetchScheduleView({ scheduleId })],
      ]
    : [model, []]

export const updateScheduleView = (model: ScheduleViewModel, message: ScheduleViewMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      FailedFetchScheduleView: ({ message: error }) => [evo(model, { view: () => AsyncData.Failure({ error }) }), []],
      SucceededFetchScheduleView: ({ view }) => [
        evo(model, { view: () => AsyncData.succeed(Option.fromNullOr(view)) }),
        [],
      ],
    })
  )

// ============================================
// View
// ============================================

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

const makeViewScheduleView = <ParentMessage>(h: HtmlBuilder<ParentMessage | ScheduleViewMessage>) => {
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
                      phase.endDate !== null ? formatShortDate(phase.endDate) : 'Indefinite'
                    }`,
                  ]
                ),
                h.span([], [phase.durationDays !== null ? `${phase.durationDays} days` : 'Indefinite']),
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
                          phase.expectedInjections !== null ? ` / ${phase.expectedInjections}` : ''
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
                      phase.injections.map((injection) =>
                        h.keyed('div')(
                          injection.id,
                          [h.Class('flex items-center justify-between gap-3 text-sm')],
                          [
                            h.span([h.Class('text-muted-foreground')], [formatDateTime(injection.datetime, timezone)]),
                            h.div(
                              [h.Class('flex items-center gap-2')],
                              [
                                h.span([h.Class('font-mono')], [`${injection.doseMg} mg`]),
                                injection.injectionSite !== null && Str.isNonEmpty(injection.injectionSite)
                                  ? h.span([h.Class('text-muted-foreground text-xs')], [`@ ${injection.injectionSite}`])
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
    const currentPhase = view.phases.find((phase) => phase.status === 'current')
    const completedPhases = view.phases.filter((phase) => phase.status === 'completed').length
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
                h.p([h.Class('text-sm text-muted-foreground')], [view.drug]),
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
                        `${formatDate(view.startDate)} - ${view.endDate !== null ? formatDate(view.endDate) : 'Indefinite'}`,
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
                        currentPhase !== undefined
                          ? `Phase ${currentPhase.order} of ${view.phases.length}`
                          : `${completedPhases}/${view.phases.length} completed`,
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
                          view.totalExpectedInjections !== null ? ` / ${view.totalExpectedInjections}` : ''
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
          view.phases.map((phase, index) =>
            h.keyed('div')(phase.id, [], [viewPhaseCard(phase, index === view.phases.length - 1, timezone)])
          )
        ),
      ]
    )
  }

  return (model: ScheduleViewModel, timezone: IanaTimezone) =>
    AsyncData.match(model.view, {
      onFailure: () =>
        h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
      onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
      onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
      onRefreshing: (view) =>
        Option.match(view, {
          onNone: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Schedule not found.']),
          onSome: (found) => viewContent(found, timezone),
        }),
      onStale: ({ data }) =>
        Option.match(data, {
          onNone: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Schedule not found.']),
          onSome: (found) => viewContent(found, timezone),
        }),
      onSuccess: (view) =>
        Option.match(view, {
          onNone: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Schedule not found.']),
          onSome: (found) => viewContent(found, timezone),
        }),
    })
}

export const viewScheduleView = <ParentMessage>(
  model: ScheduleViewModel,
  timezone: IanaTimezone,
  h: HtmlBuilder<ParentMessage | ScheduleViewMessage>
) => makeViewScheduleView(h)(model, timezone)
