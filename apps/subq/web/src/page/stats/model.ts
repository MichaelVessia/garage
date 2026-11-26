import { UiSchema } from '@effect/ui'
import { CalendarDate } from '@garage/subq-domain/Calendar'
import { GoalId } from '@garage/subq-domain/Journal/Journal.id'
import { Goal } from '@garage/subq-domain/Journal/JournalRecords'
import { WeightLbs } from '@garage/subq-domain/Values'
import type * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

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

const StatsPageMessage = UiSchema.TaggedEnum({
  ClickedStatsPreset: {
    preset: StatsPreset,
  },
  ChangedCustomStart: { value: Schema.String },
  ChangedCustomEnd: { value: Schema.String },
  CommittedCustomRange: {},
  ClickedSetGoal: {},
  CompletedOpenGoalForm: { todayLocal: CalendarDate },
  ClickedEditGoal: { goal: Goal },
  ClickedCompleteGoal: { goalId: GoalId },
  ClickedCancelGoalForm: {},
  ChangedGoalWeight: { value: Schema.String },
  ChangedGoalStartDate: { value: Schema.String },
  ChangedGoalTargetDate: { value: Schema.String },
  ChangedGoalNotes: { value: Schema.String },
  SubmittedGoalForm: {},
  SucceededSaveGoal: {},
  FailedSaveGoal: { message: Schema.String },
  RequestedDeleteGoal: {},
  CancelledDeleteGoal: {},
  ConfirmedDeleteGoal: { goalId: GoalId },
  SucceededChangeGoalStatus: {},
})

export const {
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
} = StatsPageMessage

export const StatsMessage = Schema.Union([StatsPageMessage, ChartMessage])

export type StatsMessage = typeof StatsMessage.Type

export type StatsPage = StatsModel & { readonly data: StatsBundle }
