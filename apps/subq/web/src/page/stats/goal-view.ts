import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { GoalProgress, WeightUnit } from '#shared'

import { displayWeight } from '../../data/settings.js'
import { formatDate } from '../../lib/datetime.js'
import { button, input } from '../../ui.js'
import {
  CancelledDeleteGoal,
  ChangedGoalNotes,
  ChangedGoalStartDate,
  ChangedGoalTargetDate,
  ChangedGoalWeight,
  ClickedCancelGoalForm,
  ClickedEditGoal,
  ClickedSetGoal,
  ConfirmedDeleteGoal,
  RequestedDeleteGoal,
  SubmittedGoalForm,
} from './model.js'
import type { GoalForm, StatsMessage, StatsModel } from './model.js'

const goalSubmitLabel = (form: GoalForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }

  return form.editingId === null ? 'Set Goal' : 'Save Changes'
}

const PACE_BADGES = {
  ahead: { classes: 'bg-green-100 text-green-800', label: 'Ahead of pace' },
  behind: { classes: 'bg-yellow-100 text-yellow-800', label: 'Behind pace' },
  not_losing: { classes: 'bg-gray-100 text-gray-800', label: 'Not losing' },
  on_track: { classes: 'bg-blue-100 text-blue-800', label: 'On track' },
} satisfies Record<GoalProgress['paceStatus'], { readonly label: string; readonly classes: string }>

const makeViewGoal = <ParentMessage>(h: HtmlBuilder<ParentMessage | StatsMessage>) => {
  const viewGoalForm = (form: GoalForm, unit: WeightUnit) =>
    h.form(
      [h.OnSubmit(SubmittedGoalForm({ unit }))],
      [
        h.div(
          [h.Class('grid gap-4 sm:grid-cols-2')],
          [
            h.div(
              [],
              [
                h.label(
                  [h.For('goal-weight'), h.Class('mb-2 block text-sm font-medium')],
                  [`Goal Weight (${unit}) `, h.span([h.Class('text-destructive')], ['*'])]
                ),
                h.input([
                  h.Class(input()),
                  h.Type('number'),
                  h.Id('goal-weight'),
                  h.Step('0.1'),
                  h.Min('0'),
                  h.Value(form.goalWeight),
                  h.OnInput((value) => ChangedGoalWeight({ value })),
                ]),
              ]
            ),
            h.div(
              [],
              [
                h.label([h.For('goal-start'), h.Class('mb-2 block text-sm font-medium')], ['Start Date']),
                h.input([
                  h.Class(input()),
                  h.Type('date'),
                  h.Id('goal-start'),
                  h.Value(form.startDate),
                  h.OnInput((value) => ChangedGoalStartDate({ value })),
                ]),
              ]
            ),
            h.div(
              [],
              [
                h.label([h.For('goal-target'), h.Class('mb-2 block text-sm font-medium')], ['Target Date']),
                h.input([
                  h.Class(input()),
                  h.Type('date'),
                  h.Id('goal-target'),
                  h.Value(form.targetDate),
                  h.OnInput((value) => ChangedGoalTargetDate({ value })),
                ]),
              ]
            ),
            h.div(
              [],
              [
                h.label([h.For('goal-notes'), h.Class('mb-2 block text-sm font-medium')], ['Notes']),
                h.input([
                  h.Class(input()),
                  h.Type('text'),
                  h.Id('goal-notes'),
                  h.Value(form.notes),
                  h.OnInput((value) => ChangedGoalNotes({ value })),
                ]),
              ]
            ),
          ]
        ),
        form.error === null ? h.empty : h.p([h.Class('mt-3 text-sm text-destructive')], [form.error]),
        h.div(
          [h.Class('mt-4 flex justify-end gap-3')],
          [
            h.button(
              [h.Class(button({ variant: 'outline' })), h.Type('button'), h.OnClick(ClickedCancelGoalForm())],
              ['Cancel']
            ),
            h.button(
              [h.Class(button()), h.Type('submit'), h.Disabled(form.submitting || form.goalWeight === '')],
              [goalSubmitLabel(form)]
            ),
          ]
        ),
      ]
    )

  const paceBadge = (status: GoalProgress['paceStatus']) => {
    const config = PACE_BADGES[status]

    return h.span([h.Class(`px-2 py-1 text-xs font-medium rounded-full ${config.classes}`)], [config.label])
  }

  const goalStat = (label: string, value: string, suffix: string) =>
    h.div(
      [h.Class('text-center p-3 bg-muted/50 rounded-lg')],
      [
        h.div([h.Class('text-xs text-muted-foreground mb-1')], [label]),
        h.div(
          [],
          [
            h.span([h.Class('font-mono font-semibold text-lg')], [value]),
            h.span([h.Class('text-xs text-muted-foreground ml-1')], [suffix]),
          ]
        ),
      ]
    )

  const viewDeleteConfirm = (progress: GoalProgress) =>
    h.div(
      [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')],
      [
        h.p([h.Class('text-sm')], ['Delete this goal?']),
        h.div(
          [h.Class('flex gap-2')],
          [
            h.button(
              [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(CancelledDeleteGoal())],
              ['Cancel']
            ),
            h.button(
              [
                h.Class(button({ size: 'sm', variant: 'destructive' })),
                h.OnClick(ConfirmedDeleteGoal({ goalId: progress.goal.id })),
              ],
              ['Delete Goal']
            ),
          ]
        ),
      ]
    )

  const viewProgress = (progress: GoalProgress, unit: WeightUnit) => {
    const show = (lbs: number): number => displayWeight(unit, lbs)

    return h.div(
      [h.Class('space-y-6')],
      [
        h.div(
          [],
          [
            h.div(
              [h.Class('flex items-center justify-between mb-2')],
              [
                h.span([h.Class('text-sm text-muted-foreground')], ['Progress to goal']),
                h.div(
                  [h.Class('flex items-center gap-2')],
                  [
                    paceBadge(progress.paceStatus),
                    h.button(
                      [h.Class(button({ size: 'sm', variant: 'ghost' })), h.OnClick(ClickedEditGoal())],
                      ['Edit']
                    ),
                    h.button(
                      [h.Class(button({ size: 'sm', variant: 'destructive' })), h.OnClick(RequestedDeleteGoal())],
                      ['Delete']
                    ),
                  ]
                ),
              ]
            ),
            h.div(
              [h.Class('w-full bg-muted rounded-full h-3 overflow-hidden')],
              [
                h.div(
                  [
                    h.Class('bg-primary h-full rounded-full transition-all duration-500'),
                    h.Style({ width: `${Math.min(100, Math.max(0, progress.percentComplete)).toFixed(0)}%` }),
                  ],
                  []
                ),
              ]
            ),
            h.div(
              [h.Class('flex justify-between mt-2 text-sm')],
              [
                h.span([h.Class('font-mono')], [`${show(progress.goal.startingWeight).toFixed(1)} ${unit}`]),
                h.span([h.Class('font-semibold')], [`${progress.percentComplete.toFixed(0)}%`]),
                h.span([h.Class('font-mono')], [`${show(progress.goal.goalWeight).toFixed(1)} ${unit}`]),
              ]
            ),
          ]
        ),
        h.div(
          [h.Class('grid grid-cols-2 sm:grid-cols-4 gap-4')],
          [
            goalStat('Lost', show(progress.lbsLost).toFixed(1), unit),
            goalStat('To Go', show(progress.lbsRemaining).toFixed(1), unit),
            goalStat('Avg/Week', show(progress.avgLbsPerWeek).toFixed(2), unit),
            goalStat('Days', String(progress.daysOnPlan), 'on plan'),
          ]
        ),
        progress.projectedDate === null
          ? h.empty
          : h.div(
              [h.Class('p-3 bg-muted/50 rounded-lg')],
              [
                h.span([h.Class('text-sm text-muted-foreground')], ['Projected goal date: ']),
                h.span([h.Class('font-semibold')], [formatDate(progress.projectedDate)]),
              ]
            ),
      ]
    )
  }

  return (model: StatsModel, goal: Option.Option<GoalProgress>, unit: WeightUnit): Html => {
    if (model.goalForm !== null) {
      return viewGoalForm(model.goalForm, unit)
    }

    if (model.goalDeleteConfirm && Option.isSome(goal)) {
      return viewDeleteConfirm(goal.value)
    }

    if (Option.isNone(goal)) {
      return h.div(
        [h.Class('flex flex-col items-start gap-3')],
        [
          h.p([h.Class('text-sm text-muted-foreground')], ['Set a goal to track your progress.']),
          h.button([h.Class(button()), h.OnClick(ClickedSetGoal())], ['Set Your Goal']),
        ]
      )
    }

    return viewProgress(goal.value, unit)
  }
}

export const viewGoalCardContent = <ParentMessage>({
  h,
  model,
  goal,
  unit,
}: {
  readonly h: HtmlBuilder<ParentMessage | StatsMessage>
  readonly model: StatsModel
  readonly goal: Option.Option<GoalProgress>
  readonly unit: WeightUnit
}): Html => makeViewGoal(h)(model, goal, unit)
