import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { GoalProgress } from '@garage/subq-domain/GoalMath'
import type { WeightUnit } from '@garage/subq-domain/Values'
import * as Option from 'effect/Option'

import { formatDate } from '../../lib/datetime.ts'
import { displayWeight } from '../../lib/weight-unit.ts'
import { button, input } from '../../ui.ts'
import {
  CancelledDeleteGoal,
  ChangedGoalNotes,
  ChangedGoalStartDate,
  ChangedGoalTargetDate,
  ChangedGoalWeight,
  ClickedCancelGoalForm,
  ClickedEditGoal,
  ClickedCompleteGoal,
  ClickedSetGoal,
  ConfirmedDeleteGoal,
  RequestedDeleteGoal,
  SubmittedGoalForm,
} from './model.ts'
import type { GoalForm, StatsMessage, StatsModel } from './model.ts'

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

const makeViewGoal = <ParentMessage>(h: Html.H<ParentMessage | StatsMessage>) => {
  const viewGoalForm = (form: GoalForm, unit: WeightUnit) =>
    h.form.on('submit', SubmittedGoalForm()).children(
      h.div.class('grid gap-4 sm:grid-cols-2').children(
        h.div.children(
          h.label
            .attr('for', 'goal-weight')
            .class('mb-2 block text-sm font-medium')
            .children(`Goal Weight (${unit}) `, h.span.class('text-destructive').children('*')),
          h.input
            .class(input())
            .attr('type', 'number')
            .attr('id', 'goal-weight')
            .attr('step', 'any')
            .attr('min', '0')
            .value(form.goalWeight)
            .on('input', ({ value }) => ChangedGoalWeight({ value }))
        ),
        h.div.children(
          h.label.attr('for', 'goal-start').class('mb-2 block text-sm font-medium').children('Start Date'),
          h.input
            .class(input())
            .attr('type', 'date')
            .attr('id', 'goal-start')
            .value(form.startDate)
            .on('input', ({ value }) => ChangedGoalStartDate({ value }))
        ),
        h.div.children(
          h.label.attr('for', 'goal-target').class('mb-2 block text-sm font-medium').children('Target Date'),
          h.input
            .class(input())
            .attr('type', 'date')
            .attr('id', 'goal-target')
            .value(form.targetDate)
            .on('input', ({ value }) => ChangedGoalTargetDate({ value }))
        ),
        h.div.children(
          h.label.attr('for', 'goal-notes').class('mb-2 block text-sm font-medium').children('Notes'),
          h.input
            .class(input())
            .attr('type', 'text')
            .attr('id', 'goal-notes')
            .value(form.notes)
            .on('input', ({ value }) => ChangedGoalNotes({ value }))
        )
      ),
      form.error === null ? null : h.p.class('mt-3 text-sm text-destructive').children(form.error),
      h.div.class('mt-4 flex justify-end gap-3').children(
        h.button
          .class(button({ variant: 'outline' }))
          .attr('type', 'button')
          .on('click', ClickedCancelGoalForm())
          .children('Cancel'),
        h.button
          .class(button())
          .attr('type', 'submit')
          .disabled(form.submitting || form.goalWeight === '')
          .children(goalSubmitLabel(form))
      )
    )

  const paceBadge = (status: GoalProgress['paceStatus']) => {
    const config = PACE_BADGES[status]

    return h.span.class(`px-2 py-1 text-xs font-medium rounded-full ${config.classes}`).children(config.label)
  }

  const goalStat = (label: string, value: string, suffix: string) =>
    h.div
      .class('text-center p-3 bg-muted/50 rounded-lg')
      .children(
        h.div.class('text-xs text-muted-foreground mb-1').children(label),
        h.div.children(
          h.span.class('font-mono font-semibold text-lg').children(value),
          h.span.class('text-xs text-muted-foreground ml-1').children(suffix)
        )
      )

  const viewDeleteConfirm = (progress: GoalProgress) =>
    h.div.class('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between').children(
      h.p.class('text-sm').children('Delete this goal?'),
      h.div.class('flex gap-2').children(
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .on('click', CancelledDeleteGoal())
          .children('Cancel'),
        h.button
          .class(button({ size: 'sm', variant: 'destructive' }))
          .on('click', ConfirmedDeleteGoal({ goalId: progress.goal.id }))
          .children('Delete Goal')
      )
    )

  const viewProgress = (progress: GoalProgress, unit: WeightUnit) => {
    const show = (lbs: number): number => displayWeight(unit, lbs)

    return h.div.class('space-y-6').children(
      h.div.children(
        h.div.class('flex items-center justify-between mb-2').children(
          h.span.class('text-sm text-muted-foreground').children('Progress to goal'),
          h.div.class('flex items-center gap-2').children(
            paceBadge(progress.paceStatus),
            h.button
              .class(button({ size: 'sm', variant: 'outline' }))
              .on('click', ClickedCompleteGoal({ goalId: progress.goal.id }))
              .children('Complete Goal'),
            h.button
              .class(button({ size: 'sm', variant: 'ghost' }))
              .on('click', ClickedEditGoal({ goal: progress.goal }))
              .children('Edit'),
            h.button
              .class(button({ size: 'sm', variant: 'destructive' }))
              .on('click', RequestedDeleteGoal())
              .children('Delete')
          )
        ),
        h.div
          .class('w-full bg-muted rounded-full h-3 overflow-hidden')
          .children(
            h.div
              .class('bg-primary h-full rounded-full transition-all duration-500')
              .style({ width: `${Math.min(100, Math.max(0, progress.percentComplete)).toFixed(0)}%` })
          ),
        h.div
          .class('flex justify-between mt-2 text-sm')
          .children(
            h.span.class('font-mono').children(`${show(progress.goal.startingWeightLbs).toFixed(1)} ${unit}`),
            h.span.class('font-semibold').children(`${progress.percentComplete.toFixed(0)}%`),
            h.span.class('font-mono').children(`${show(progress.goal.goalWeightLbs).toFixed(1)} ${unit}`)
          )
      ),
      h.div
        .class('grid grid-cols-2 sm:grid-cols-4 gap-4')
        .children(
          goalStat('Lost', show(progress.lbsLost).toFixed(1), unit),
          goalStat('To Go', show(progress.lbsRemaining).toFixed(1), unit),
          goalStat('Avg/Week', show(progress.avgLbsPerWeek).toFixed(2), unit),
          goalStat('Days', String(progress.daysOnPlan), 'on plan')
        ),
      progress.projectedDate === null
        ? null
        : h.div
            .class('p-3 bg-muted/50 rounded-lg')
            .children(
              h.span.class('text-sm text-muted-foreground').children('Projected goal date: '),
              h.span.class('font-semibold').children(formatDate(progress.projectedDate))
            )
    )
  }

  return (
    model: StatsModel,
    goal: Option.Option<GoalProgress>,
    unit: WeightUnit
  ): View.Content<ParentMessage | StatsMessage> => {
    if (model.goalForm !== null) {
      return viewGoalForm(model.goalForm, unit)
    }

    if (model.goalDeleteConfirm && Option.isSome(goal)) {
      return viewDeleteConfirm(goal.value)
    }

    if (Option.isNone(goal)) {
      return h.div
        .class('flex flex-col items-start gap-3')
        .children(
          h.p.class('text-sm text-muted-foreground').children('Set a goal to track your progress.'),
          h.button.class(button()).on('click', ClickedSetGoal()).children('Set Your Goal')
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
  readonly h: Html.H<ParentMessage | StatsMessage>
  readonly model: StatsModel
  readonly goal: Option.Option<GoalProgress>
  readonly unit: WeightUnit
}): View.Content<ParentMessage | StatsMessage> => makeViewGoal(h)(model, goal, unit)
