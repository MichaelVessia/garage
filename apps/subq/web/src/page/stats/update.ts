import { CalendarDate } from '@garage/subq-domain/Calendar'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import { GoalId } from '@garage/subq-domain/Journal/Journal.id'
import type { Goal, NewGoal } from '@garage/subq-domain/Journal/JournalRecords'
import { Notes, WeightLbs } from '@garage/subq-domain/Values'
import type { WeightUnit } from '@garage/subq-domain/Values'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type * as Types from 'effect/Types'
import { modifyFields } from 'foldkit/struct'

import { ChartMessage, updateChart } from '../../chart/state.ts'
import { client, mutate } from '../../client.ts'
import type { PageUpdate } from '../../client.ts'
import { dateToCalendarDate, epochToDate } from '../../lib/datetime.ts'
import { optionalText } from '../../lib/form.ts'
import { toStorageLbs, weightInputValue } from '../../lib/weight-unit.ts'
import { ApplyPreset, NavigateStatsRange, OpenGoalForm } from './command.ts'
import { FailedSaveGoal, SucceededChangeGoalStatus, SucceededSaveGoal } from './model.ts'
import type { StatsMessage, StatsModel } from './model.ts'

type UpdateReturn = PageUpdate<StatsModel, StatsMessage>

const saveGoal = (id: Option.Option<GoalId>, fields: typeof NewGoal.Type) =>
  mutate(
    (request) =>
      Option.isNone(id)
        ? client.SetGoal({ ...request, input: { ...fields, goalId: GoalId.make(request.commandId) } })
        : client.ReviseGoal({ ...request, input: { ...fields, goalId: id.value } }),
    SucceededSaveGoal(),
    (message) => FailedSaveGoal({ message })
  )

const changeGoalStatus = (goalId: GoalId, complete: boolean) =>
  mutate(
    (request) =>
      complete
        ? client.CompleteGoal({ ...request, input: { goalId } })
        : client.RemoveGoal({ ...request, input: { goalId } }),
    SucceededChangeGoalStatus(),
    (message) => FailedSaveGoal({ message })
  )

const isChartMessage = Schema.is(ChartMessage)

const decodeCalendarDate = Schema.decodeOption(CalendarDate)

const parseOptionalCalendarDate = (value: string): Option.Option<Option.Option<CalendarDate>> =>
  value === '' ? Option.some(Option.none()) : decodeCalendarDate(value).pipe(Option.map(Option.some))

const submitGoalForm = (model: StatsModel, unit: WeightUnit): UpdateReturn => {
  if (model.goalForm === null || model.goalForm.submitting) {
    return { model }
  }

  const { goalWeight, originalWeightLbs } = model.goalForm
  const parsed =
    originalWeightLbs !== null && goalWeight === weightInputValue({ unit, lbs: originalWeightLbs })
      ? originalWeightLbs
      : toStorageLbs(unit, Number(goalWeight))

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      model: modifyFields(model, {
        goalForm: (form) => (form === null ? null : modifyFields(form, { error: () => 'Enter a valid goal weight' })),
      }),
    }
  }

  const startDate = parseOptionalCalendarDate(model.goalForm.startDate)
  const targetDate = parseOptionalCalendarDate(model.goalForm.targetDate)

  if (Option.isNone(startDate) || Option.isNone(targetDate)) {
    return {
      model: modifyFields(model, {
        goalForm: (form) => (form === null ? null : modifyFields(form, { error: () => 'Enter valid goal dates' })),
      }),
    }
  }

  const input: Types.Mutable<typeof NewGoal.Type> = {
    goalWeightLbs: WeightLbs.make(parsed),
    notes: Option.getOrNull(Option.map(optionalText(model.goalForm.notes), (note) => Notes.make(note))),
    targetDate: Option.getOrNull(targetDate.value),
  }
  if (Option.isSome(startDate.value)) {
    input.startingDate = startDate.value.value
  }

  return {
    model: modifyFields(model, {
      goalForm: (form) => (form === null ? null : modifyFields(form, { error: () => null, submitting: () => true })),
    }),
    mutation: saveGoal(Option.fromNullOr(model.goalForm.editingId), input),
  }
}

const editGoal = (model: StatsModel, goal: Goal, unit: WeightUnit): UpdateReturn => ({
  model: modifyFields(model, {
    goalForm: () => ({
      editingId: goal.id,
      error: null,
      goalWeight: weightInputValue({ unit, lbs: goal.goalWeightLbs }),
      originalWeightLbs: goal.goalWeightLbs,
      notes: goal.notes ?? '',
      startDate: goal.startingDate,
      submitting: false,
      targetDate: goal.targetDate ?? '',
    }),
  }),
})

const commitCustomRange = (model: StatsModel): UpdateReturn => {
  if (model.customStart === '' || model.customEnd === '' || model.customStart >= model.customEnd) {
    return { model }
  }

  const start = decodeCalendarDate(model.customStart)
  const end = decodeCalendarDate(model.customEnd)

  return Option.isSome(start) && Option.isSome(end)
    ? { model, commands: [NavigateStatsRange({ end: end.value, start: start.value })] }
    : { model }
}

const updateChartMessage = (model: StatsModel, message: ChartMessage, timezone: IanaTimezone): UpdateReturn => {
  const [chart, zoom] = updateChart(model.chart, message)
  const next = modifyFields(model, { chart: () => chart })

  return Option.match(zoom, {
    onNone: (): UpdateReturn => ({ model: next }),
    onSome: (committed) => {
      const start = dateToCalendarDate(epochToDate(committed.startMs), timezone)
      const end = dateToCalendarDate(epochToDate(committed.endMs), timezone)

      return { model: next, commands: [NavigateStatsRange({ end, start })] }
    },
  })
}

// @effect-diagnostics-next-line missingPipeableSignature:off -- The reducer takes the current page state and display preferences.
export const updateStats = (
  model: StatsModel,
  message: StatsMessage,
  timezone: IanaTimezone,
  unit: WeightUnit
): UpdateReturn => {
  if (isChartMessage(message)) {
    return updateChartMessage(model, message, timezone)
  }

  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteGoal: () => ({ model: modifyFields(model, { goalDeleteConfirm: () => false }) }),
      ChangedCustomEnd: ({ value }) => ({ model: modifyFields(model, { customEnd: () => value }) }),
      ChangedCustomStart: ({ value }) => ({ model: modifyFields(model, { customStart: () => value }) }),
      ChangedGoalNotes: ({ value }) => ({
        model: modifyFields(model, {
          goalForm: (form) => (form === null ? null : modifyFields(form, { notes: () => value })),
        }),
      }),
      ChangedGoalStartDate: ({ value }) => ({
        model: modifyFields(model, {
          goalForm: (form) => (form === null ? null : modifyFields(form, { startDate: () => value })),
        }),
      }),
      ChangedGoalTargetDate: ({ value }) => ({
        model: modifyFields(model, {
          goalForm: (form) => (form === null ? null : modifyFields(form, { targetDate: () => value })),
        }),
      }),
      ChangedGoalWeight: ({ value }) => ({
        model: modifyFields(model, {
          goalForm: (form) => (form === null ? null : modifyFields(form, { goalWeight: () => value })),
        }),
      }),
      ClickedCancelGoalForm: () => ({ model: modifyFields(model, { goalForm: () => null }) }),
      ClickedEditGoal: ({ goal }) => editGoal(model, goal, unit),
      ClickedCompleteGoal: ({ goalId }) => ({ model, mutation: changeGoalStatus(goalId, true) }),
      ClickedSetGoal: () => ({ model, commands: [OpenGoalForm({ timezone })] }),
      ClickedStatsPreset: ({ preset }) => ({ model, commands: [ApplyPreset({ preset, timezone })] }),
      CommittedCustomRange: () => commitCustomRange(model),
      ConfirmedDeleteGoal: ({ goalId }) => ({
        model: modifyFields(model, { goalDeleteConfirm: () => false }),
        mutation: changeGoalStatus(goalId, false),
      }),
      NavigatedStats: () => ({ model }),
      FailedSaveGoal: ({ message: error }) => ({
        model: modifyFields(model, {
          goalForm: (form) =>
            form === null ? null : modifyFields(form, { error: () => error, submitting: () => false }),
        }),
      }),
      CompletedOpenGoalForm: ({ todayLocal }) => ({
        model: modifyFields(model, {
          goalForm: () => ({
            editingId: null,
            error: null,
            goalWeight: '',
            originalWeightLbs: null,
            notes: '',
            startDate: todayLocal,
            submitting: false,
            targetDate: '',
          }),
        }),
      }),
      RequestedDeleteGoal: () => ({ model: modifyFields(model, { goalDeleteConfirm: () => true }) }),
      SubmittedGoalForm: () => submitGoalForm(model, unit),
      SucceededChangeGoalStatus: () => ({ model }),
      SucceededSaveGoal: () => ({ model: { ...model, goalForm: null } }),
    })
  )
}
