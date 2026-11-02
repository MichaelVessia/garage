import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { AsyncData } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import {
  CalendarDate,
  DoseHistoryStats,
  DrugBreakdownStats,
  GoalId,
  GoalProgress,
  IanaTimezone,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionLog,
  InjectionSchedule,
  InjectionSiteStats,
  WeightStats,
  WeightTrendStats,
} from '#shared'

import { ChartMessage, ChartState, initialChartState } from '../../chart/state.js'

// ============================================
// Model
// ============================================

export const StatsBundle = Schema.Struct({
  weightStats: Schema.NullOr(WeightStats),
  weightTrend: WeightTrendStats,
  injections: Schema.Array(InjectionLog),
  siteStats: InjectionSiteStats,
  doseHistory: DoseHistoryStats,
  frequency: Schema.NullOr(InjectionFrequencyStats),
  drugBreakdown: DrugBreakdownStats,
  dayOfWeek: InjectionDayOfWeekStats,
  schedules: Schema.Array(InjectionSchedule),
  goal: Schema.NullOr(GoalProgress),
})

export type StatsBundle = typeof StatsBundle.Type

export const StatsPreset = Schema.Literals(['1m', '3m', '6m', '1y', 'all'])

export type StatsPreset = typeof StatsPreset.Type

const GoalForm = Schema.Struct({
  editingId: Schema.NullOr(GoalId),
  goalWeight: Schema.String,
  startDate: Schema.String,
  targetDate: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type GoalForm = typeof GoalForm.Type

export const StatsModel = Schema.Struct({
  data: AsyncData.Schema(StatsBundle, Schema.String).schema,
  // range key ("startIso|endIso") and timezone for the current request
  fetchedRange: Schema.NullOr(Schema.String),
  fetchedTimezone: Schema.NullOr(IanaTimezone),
  requestGeneration: Schema.Int,
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
  data: AsyncData.Idle(),
  fetchedRange: null,
  fetchedTimezone: null,
  goalDeleteConfirm: false,
  goalForm: null,
  requestGeneration: 0,
}

export interface StatsRange {
  readonly start: Option.Option<CalendarDate>
  readonly end: Option.Option<CalendarDate>
}

export const rangeKey = (range: StatsRange): string =>
  `${Option.getOrElse(range.start, () => '')}|${Option.getOrElse(range.end, () => '')}`

export const distinctStatsResultTimezones = (
  results: ReadonlyArray<{ readonly timezone: IanaTimezone }>
): ReadonlyArray<IanaTimezone> => Arr.dedupe(Arr.map(results, ({ timezone }) => timezone))

// ============================================
// Messages
// ============================================

export const SucceededFetchStats = taggedStruct('SucceededFetchStats', {
  bundle: StatsBundle,
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Int,
  timezone: IanaTimezone,
})

export const RejectedFetchStats = taggedStruct('RejectedFetchStats', {
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Int,
  timezones: Schema.Array(IanaTimezone),
})

export const FailedFetchStats = taggedStruct('FailedFetchStats', {
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Int,
  message: Schema.String,
})

export const ClickedStatsPreset = taggedStruct('ClickedStatsPreset', {
  preset: StatsPreset,
})

export const ChangedCustomStart = taggedStruct('ChangedCustomStart', { value: Schema.String })
export const ChangedCustomEnd = taggedStruct('ChangedCustomEnd', { value: Schema.String })
export const CommittedCustomRange = taggedStruct('CommittedCustomRange')
export const ClickedSetGoal = taggedStruct('ClickedSetGoal')
export const CompletedOpenGoalForm = taggedStruct('CompletedOpenGoalForm', { todayLocal: CalendarDate })
export const ClickedEditGoal = taggedStruct('ClickedEditGoal')
export const ClickedCancelGoalForm = taggedStruct('ClickedCancelGoalForm')
export const ChangedGoalWeight = taggedStruct('ChangedGoalWeight', { value: Schema.String })
export const ChangedGoalStartDate = taggedStruct('ChangedGoalStartDate', { value: Schema.String })
export const ChangedGoalTargetDate = taggedStruct('ChangedGoalTargetDate', { value: Schema.String })
export const ChangedGoalNotes = taggedStruct('ChangedGoalNotes', { value: Schema.String })
export const SubmittedGoalForm = taggedStruct('SubmittedGoalForm', { unit: Schema.Literals(['lbs', 'kg']) })
export const SucceededSaveGoal = taggedStruct('SucceededSaveGoal')
export const FailedSaveGoal = taggedStruct('FailedSaveGoal', { message: Schema.String })
export const RequestedDeleteGoal = taggedStruct('RequestedDeleteGoal')
export const CancelledDeleteGoal = taggedStruct('CancelledDeleteGoal')
export const ConfirmedDeleteGoal = taggedStruct('ConfirmedDeleteGoal', { goalId: GoalId })
export const SucceededDeleteGoal = taggedStruct('SucceededDeleteGoal')
export const NavigatedStats = taggedStruct('NavigatedStats')

export const FetchStatsResult = Schema.Union([SucceededFetchStats, RejectedFetchStats])

export type FetchStatsResult = typeof FetchStatsResult.Type

export const StatsMessage = Schema.Union([
  SucceededFetchStats,
  RejectedFetchStats,
  FailedFetchStats,
  ClickedStatsPreset,
  ChangedCustomStart,
  ChangedCustomEnd,
  CommittedCustomRange,
  ClickedSetGoal,
  CompletedOpenGoalForm,
  ClickedEditGoal,
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
  SucceededDeleteGoal,
  NavigatedStats,
  ChartMessage,
])

export type StatsMessage = typeof StatsMessage.Type
