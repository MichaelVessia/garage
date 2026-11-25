import { CalendarDate } from '@garage/subq-domain/Calendar'
import { GoalId } from '@garage/subq-domain/Journal/Journal.id'
import { Goal } from '@garage/subq-domain/Journal/JournalRecords'
import { WeightLbs } from '@garage/subq-domain/Values'
import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { taggedStruct } from 'foldkit/schema'

import { ChartMessage, ChartState, initialChartState } from '../../chart/state.ts'
import type { StatsBundle } from './data.ts'

export const StatsPreset = Schema.Literals(['1m', '3m', '6m', '1y', 'all'])

export type StatsPreset = typeof StatsPreset.Type

const GoalForm = Schema.Struct({
  editingId: Schema.NullOr(GoalId),
  goalWeight: Schema.String,
  originalWeightLbs: Schema.NullOr(WeightLbs),
  startDate: Schema.String,
  targetDate: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type GoalForm = typeof GoalForm.Type

export const StatsModel = Schema.Struct({
  chart: ChartState,
  goalForm: Schema.NullOr(GoalForm),
  goalDeleteConfirm: Schema.Boolean,
  customStart: Schema.String,
  customEnd: Schema.String,
})

export type StatsModel = typeof StatsModel.Type

export const initialStatsModel: StatsModel = {
  chart: initialChartState,
  customEnd: '',
  customStart: '',
  goalDeleteConfirm: false,
  goalForm: null,
}

export interface StatsRange {
  readonly start: Option.Option<CalendarDate>
  readonly end: Option.Option<CalendarDate>
}

export const ClickedStatsPreset = taggedStruct('ClickedStatsPreset', {
  preset: StatsPreset,
})

export const ChangedCustomStart = taggedStruct('ChangedCustomStart', { value: Schema.String })

export const ChangedCustomEnd = taggedStruct('ChangedCustomEnd', { value: Schema.String })

export const CommittedCustomRange = taggedStruct('CommittedCustomRange')

export const ClickedSetGoal = taggedStruct('ClickedSetGoal')

export const CompletedOpenGoalForm = taggedStruct('CompletedOpenGoalForm', { todayLocal: CalendarDate })

export const ClickedEditGoal = taggedStruct('ClickedEditGoal', { goal: Goal })

export const ClickedCompleteGoal = taggedStruct('ClickedCompleteGoal', { goalId: GoalId })

export const ClickedCancelGoalForm = taggedStruct('ClickedCancelGoalForm')

export const ChangedGoalWeight = taggedStruct('ChangedGoalWeight', { value: Schema.String })

export const ChangedGoalStartDate = taggedStruct('ChangedGoalStartDate', { value: Schema.String })

export const ChangedGoalTargetDate = taggedStruct('ChangedGoalTargetDate', { value: Schema.String })

export const ChangedGoalNotes = taggedStruct('ChangedGoalNotes', { value: Schema.String })

export const SubmittedGoalForm = taggedStruct('SubmittedGoalForm')

export const SucceededSaveGoal = taggedStruct('SucceededSaveGoal')

export const FailedSaveGoal = taggedStruct('FailedSaveGoal', { message: Schema.String })

export const RequestedDeleteGoal = taggedStruct('RequestedDeleteGoal')

export const CancelledDeleteGoal = taggedStruct('CancelledDeleteGoal')

export const ConfirmedDeleteGoal = taggedStruct('ConfirmedDeleteGoal', { goalId: GoalId })

export const SucceededChangeGoalStatus = taggedStruct('SucceededChangeGoalStatus')

export const NavigatedStats = taggedStruct('NavigatedStats')

export const StatsMessage = Schema.Union([
  ClickedStatsPreset,
  ChangedCustomStart,
  ChangedCustomEnd,
  CommittedCustomRange,
  ClickedSetGoal,
  CompletedOpenGoalForm,
  ClickedEditGoal,
  ClickedCompleteGoal,
  ClickedCancelGoalForm,
  ChangedGoalWeight,
  ChangedGoalStartDate,
  ChangedGoalTargetDate,
  ChangedGoalNotes,
  SubmittedGoalForm,
  SucceededSaveGoal,
  FailedSaveGoal,
  RequestedDeleteGoal,
  CancelledDeleteGoal,
  ConfirmedDeleteGoal,
  SucceededChangeGoalStatus,
  NavigatedStats,
  ChartMessage,
])

export type StatsMessage = typeof StatsMessage.Type

export type StatsPage = StatsModel & { readonly data: StatsBundle }
