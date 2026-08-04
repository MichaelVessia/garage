import * as d3 from 'd3'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'

import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateStartUtc,
  CalendarDate,
  DoseHistoryStats,
  GoalId,
  DrugBreakdownStats,
  GoalProgress,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionLog,
  InjectionLogListParams,
  InjectionSchedule,
  IanaTimezone,
  InjectionSiteStats,
  Limit,
  Notes,
  Offset,
  StatsParams,
  UserGoalCreate,
  UserGoalDelete,
  UserGoalUpdate,
  Weight,
  WeightStats,
  WeightTrendStats,
} from '#shared'
import type { WeightUnit } from '#shared'

import { Api } from '../api.js'
import type { InjectionPoint, SchedulePeriod, WeightPoint } from '../chart/weight-trend.js'
import {
  CHART_COLORS,
  ChartMessage,
  ChartState,
  getDoseColor,
  initialChartState,
  updateChart,
  viewWeightTrend,
} from '../chart/weight-trend.js'
import { FetchSettings, displayWeight, formatWeight } from '../data/settings.js'
import type { FailedFetchSettings, SucceededFetchSettings } from '../data/settings.js'
import { dateToCalendarDate, epochToDate, formatDate, utcToLocalDateString } from '../lib/datetime.js'
import { statsRouter } from '../route.js'
import { button, card, input } from '../ui.js'

// ============================================
// Model
// ============================================

const StatsBundle = Schema.Struct({
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
type StatsBundle = typeof StatsBundle.Type

const GoalForm = Schema.Struct({
  editingId: Schema.NullOr(GoalId),
  goalWeight: Schema.String,
  startDate: Schema.String,
  targetDate: Schema.String,
  notes: Schema.String,
  submitting: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})
type GoalForm = typeof GoalForm.Type

export const StatsModel = Schema.Struct({
  data: AsyncData.Schema(StatsBundle, Schema.String).schema,
  // range key ("startIso|endIso") and timezone for the current request
  fetchedRange: Schema.NullOr(Schema.String),
  fetchedTimezone: Schema.NullOr(IanaTimezone),
  requestGeneration: Schema.Number,
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
): ReadonlyArray<IanaTimezone> => Arr.dedupe(results.map(({ timezone }) => timezone))

// ============================================
// Messages
// ============================================

export const SucceededFetchStats = m('SucceededFetchStats', {
  bundle: StatsBundle,
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Number,
  timezone: IanaTimezone,
})
export const RejectedFetchStats = m('RejectedFetchStats', {
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Number,
  timezones: Schema.Array(IanaTimezone),
})
export const FailedFetchStats = m('FailedFetchStats', {
  key: Schema.String,
  requestedTimezone: IanaTimezone,
  requestGeneration: Schema.Number,
  message: Schema.String,
})
export const ClickedStatsPreset = m('ClickedStatsPreset', {
  preset: Schema.Literals(['1m', '3m', '6m', '1y', 'all']),
})
export const ChangedCustomStart = m('ChangedCustomStart', { value: Schema.String })
export const ChangedCustomEnd = m('ChangedCustomEnd', { value: Schema.String })
export const CommittedCustomRange = m('CommittedCustomRange')
export const ClickedSetGoal = m('ClickedSetGoal')
export const OpenedGoalForm = m('OpenedGoalForm', { todayLocal: CalendarDate })
export const ClickedEditGoal = m('ClickedEditGoal')
export const ClickedCancelGoalForm = m('ClickedCancelGoalForm')
export const ChangedGoalWeight = m('ChangedGoalWeight', { value: Schema.String })
export const ChangedGoalStartDate = m('ChangedGoalStartDate', { value: Schema.String })
export const ChangedGoalTargetDate = m('ChangedGoalTargetDate', { value: Schema.String })
export const ChangedGoalNotes = m('ChangedGoalNotes', { value: Schema.String })
export const SubmittedGoalForm = m('SubmittedGoalForm', { unit: Schema.Literals(['lbs', 'kg']) })
export const SucceededSaveGoal = m('SucceededSaveGoal')
export const FailedSaveGoal = m('FailedSaveGoal', { message: Schema.String })
export const RequestedDeleteGoal = m('RequestedDeleteGoal')
export const CancelledDeleteGoal = m('CancelledDeleteGoal')
export const ConfirmedDeleteGoal = m('ConfirmedDeleteGoal', { goalId: GoalId })
export const SucceededDeleteGoal = m('SucceededDeleteGoal')
export const NavigatedStats = m('NavigatedStats')

const FetchStatsResult = Schema.Union([SucceededFetchStats, RejectedFetchStats])

export const StatsMessage = Schema.Union([
  SucceededFetchStats,
  RejectedFetchStats,
  FailedFetchStats,
  ClickedStatsPreset,
  ChangedCustomStart,
  ChangedCustomEnd,
  CommittedCustomRange,
  ClickedSetGoal,
  OpenedGoalForm,
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

// ============================================
// Commands
// ============================================

const toStatsParams = (range: StatsRange): StatsParams =>
  new StatsParams({
    endDate: Option.getOrUndefined(range.end),
    startDate: Option.getOrUndefined(range.start),
  })

export const FetchStats = Command.define(
  'FetchStats',
  {
    start: Schema.NullOr(CalendarDate),
    end: Schema.NullOr(CalendarDate),
    requestGeneration: Schema.Number,
    timezone: IanaTimezone,
  },
  FetchStatsResult,
  FailedFetchStats
)(({ end, requestGeneration, start, timezone }) =>
  Effect.gen(function* () {
    const api = yield* Api
    const range: StatsRange = { end: Option.fromNullishOr(end), start: Option.fromNullishOr(start) }
    const params = toStatsParams(range)
    const listParams = new InjectionLogListParams({
      endDate:
        end === null
          ? undefined
          : DateTime.makeUnsafe(DateTime.toEpochMillis(calendarDateStartUtc(addCalendarDays(end, 1), timezone)) - 1),
      limit: Limit.make(10_000),
      offset: Offset.make(0),
      startDate: start === null ? undefined : calendarDateStartUtc(start, timezone),
    })
    const responses = yield* Effect.all(
      {
        dayOfWeek: api.GetInjectionByDayOfWeek(params),
        doseHistory: api.GetDoseHistory(params),
        drugBreakdown: api.GetDrugBreakdown(params),
        frequency: api.GetInjectionFrequency(params),
        goal: api.GoalGetProgress(),
        injections: api.InjectionLogList(listParams),
        schedules: api.ScheduleList(),
        siteStats: api.GetInjectionSiteStats(params),
        weightStats: api.GetWeightStats(params),
        weightTrend: api.GetWeightTrend(params),
      },
      { concurrency: 'unbounded' }
    )
    const timezones = distinctStatsResultTimezones([
      responses.dayOfWeek,
      responses.doseHistory,
      responses.drugBreakdown,
      responses.frequency,
      responses.goal,
      responses.siteStats,
      responses.weightStats,
      responses.weightTrend,
    ])
    const responseTimezone = responses.dayOfWeek.timezone
    if (timezones.length !== 1 || responseTimezone !== timezone) {
      return RejectedFetchStats({
        key: rangeKey(range),
        requestedTimezone: timezone,
        requestGeneration,
        timezones,
      })
    }
    const bundle: StatsBundle = {
      dayOfWeek: responses.dayOfWeek.data,
      doseHistory: responses.doseHistory.data,
      drugBreakdown: responses.drugBreakdown.data,
      frequency: responses.frequency.data,
      goal: responses.goal.goal,
      injections: responses.injections,
      schedules: responses.schedules,
      siteStats: responses.siteStats.data,
      weightStats: responses.weightStats.data,
      weightTrend: responses.weightTrend.data,
    }
    return SucceededFetchStats({
      bundle,
      key: rangeKey(range),
      requestedTimezone: timezone,
      requestGeneration,
      timezone: responseTimezone,
    })
  }).pipe(
    Effect.tapError((cause) => Effect.logDebug('FetchStats failed', { error: cause })),
    Effect.orElseSucceed(() =>
      FailedFetchStats({
        key: rangeKey({ end: Option.fromNullishOr(end), start: Option.fromNullishOr(start) }),
        message: 'Failed to load stats',
        requestedTimezone: timezone,
        requestGeneration,
      })
    )
  )
)

const presetStartDate = (end: CalendarDate, preset: '1m' | '3m' | '6m' | '1y' | 'all'): CalendarDate => {
  if (preset === '1m') {
    return addCalendarMonths(end, -1)
  }
  if (preset === '3m') {
    return addCalendarMonths(end, -3)
  }
  if (preset === '6m') {
    return addCalendarMonths(end, -6)
  }
  if (preset === '1y') {
    return addCalendarMonths(end, -12)
  }
  return end
}

// Preset click → compute range from "now" → push URL (route change refetches)
const ApplyPreset = Command.define(
  'ApplyPreset',
  { preset: Schema.Literals(['1m', '3m', '6m', '1y', 'all']), timezone: IanaTimezone },
  NavigatedStats
)(({ preset, timezone }) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    const end = utcToLocalDateString(now, timezone)
    const start = presetStartDate(end, preset)
    const href =
      preset === 'all'
        ? statsRouter({ end: Option.none(), start: Option.none() })
        : statsRouter({
            end: Option.some(end),
            start: Option.some(start),
          })
    yield* pushUrl(href)
    return NavigatedStats()
  })
)

const NavigateStatsRange = Command.define(
  'NavigateStatsRange',
  { start: CalendarDate, end: CalendarDate },
  NavigatedStats
)(({ end, start }) =>
  pushUrl(statsRouter({ end: Option.some(end), start: Option.some(start) })).pipe(Effect.as(NavigatedStats()))
)

const OpenGoalForm = Command.define(
  'OpenGoalForm',
  { timezone: IanaTimezone },
  OpenedGoalForm
)(({ timezone }) =>
  DateTime.now.pipe(Effect.map((now) => OpenedGoalForm({ todayLocal: utcToLocalDateString(now, timezone) })))
)

const SaveGoal = Command.define(
  'SaveGoal',
  {
    editingId: Schema.NullOr(GoalId),
    goalWeightLbs: Schema.Number,
    startDate: Schema.NullOr(CalendarDate),
    targetDate: Schema.NullOr(CalendarDate),
    notes: Schema.String,
  },
  SucceededSaveGoal,
  FailedSaveGoal
)(({ editingId, goalWeightLbs, notes, startDate, targetDate }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* editingId === null
      ? api.GoalCreate(
          new UserGoalCreate({
            goalWeight: Weight.make(goalWeightLbs),
            notes: notes === '' ? Option.none() : Option.some(Notes.make(notes)),
            startingDate: Option.fromNullOr(startDate),
            targetDate: Option.fromNullOr(targetDate),
          })
        )
      : api.GoalUpdate(
          new UserGoalUpdate({
            goalWeight: Weight.make(goalWeightLbs),
            id: editingId,
            notes: notes === '' ? null : Notes.make(notes),
            startingDate: startDate ?? undefined,
            targetDate,
          })
        )
    return SucceededSaveGoal()
  }).pipe(
    Effect.tapError((cause) => Effect.logDebug('SaveGoal failed', { error: cause })),
    Effect.orElseSucceed(() => FailedSaveGoal({ message: 'Failed to save goal' }))
  )
)

const DeleteGoal = Command.define(
  'DeleteGoal',
  { goalId: GoalId },
  SucceededDeleteGoal,
  FailedSaveGoal
)(({ goalId }) =>
  Effect.gen(function* () {
    const api = yield* Api
    yield* api.GoalDelete(new UserGoalDelete({ id: goalId }))
    return SucceededDeleteGoal()
  }).pipe(
    Effect.tapError((cause) => Effect.logDebug('DeleteGoal failed', { error: cause })),
    Effect.orElseSucceed(() => FailedSaveGoal({ message: 'Failed to delete goal' }))
  )
)

// ============================================
// Update
// ============================================

type StatsCommandMessage =
  | StatsMessage
  | typeof NavigatedStats.Type
  | typeof SucceededFetchSettings.Type
  | typeof FailedFetchSettings.Type

type StatsCommands = ReadonlyArray<Command.Command<StatsCommandMessage, never, Api>>
type UpdateReturn = readonly [StatsModel, StatsCommands]

const fetchStatsCommand = (range: StatsRange, timezone: IanaTimezone, requestGeneration: number) =>
  FetchStats({
    end: Option.getOrNull(range.end),
    requestGeneration,
    start: Option.getOrNull(range.start),
    timezone,
  })

const startStatsFetch = (model: StatsModel, range: StatsRange, timezone: IanaTimezone): UpdateReturn => {
  const requestGeneration = model.requestGeneration + 1
  return [
    evo(model, {
      customEnd: () => Option.getOrElse(range.end, () => ''),
      customStart: () => Option.getOrElse(range.start, () => ''),
      data: () => AsyncData.Loading(),
      fetchedRange: () => rangeKey(range),
      fetchedTimezone: () => timezone,
      requestGeneration: () => requestGeneration,
    }),
    [fetchStatsCommand(range, timezone, requestGeneration)],
  ]
}

// Called by the app root when the stats route is entered or its range changes.
export const syncStatsFetch = (model: StatsModel, range: StatsRange, timezone: IanaTimezone): UpdateReturn => {
  const key = rangeKey(range)
  return model.fetchedRange === key && model.fetchedTimezone === timezone && !AsyncData.isIdle(model.data)
    ? [model, []]
    : startStatsFetch(model, range, timezone)
}

const splitRangeKey = (key: string): StatsRange => {
  const [start, end] = key.split('|')
  return {
    end: end === undefined || end === '' ? Option.none() : Option.some(CalendarDate.make(end)),
    start: start === undefined || start === '' ? Option.none() : Option.some(CalendarDate.make(start)),
  }
}

const isChartMessage = Schema.is(ChartMessage)

const parseOptionalCalendarDate = (value: string): Option.Option<Option.Option<CalendarDate>> =>
  value === ''
    ? Option.some(Option.none())
    : Schema.decodeUnknownOption(CalendarDate)(value).pipe(Option.map(Option.some))

const prepareStatsTimezoneReconciliation = (model: StatsModel): StatsModel =>
  evo(model, {
    data: () => AsyncData.Idle(),
    fetchedRange: () => null,
    fetchedTimezone: () => null,
  })

const isCurrentStatsResponse = (
  model: StatsModel,
  key: string,
  requestedTimezone: IanaTimezone,
  requestGeneration: number,
  timezone: IanaTimezone
): boolean =>
  key === model.fetchedRange &&
  requestedTimezone === model.fetchedTimezone &&
  requestedTimezone === timezone &&
  requestGeneration === model.requestGeneration

export const updateStats = (
  model: StatsModel,
  message: StatsMessage,
  timezone: IanaTimezone,
  settingsRequestGeneration: number
): UpdateReturn => {
  if (isChartMessage(message)) {
    const [chart, zoom] = updateChart(model.chart, message)
    const next = evo(model, { chart: () => chart })
    return Option.match(zoom, {
      onNone: (): UpdateReturn => [next, []],
      onSome: (committed) => {
        const start = dateToCalendarDate(epochToDate(committed.startMs), timezone)
        const end = dateToCalendarDate(epochToDate(committed.endMs), timezone)
        return [next, [NavigateStatsRange({ end, start })]]
      },
    })
  }
  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      CancelledDeleteGoal: () => [evo(model, { goalDeleteConfirm: () => false }), []],
      ChangedCustomEnd: ({ value }) => [evo(model, { customEnd: () => value }), []],
      ChangedCustomStart: ({ value }) => [evo(model, { customStart: () => value }), []],
      ChangedGoalNotes: ({ value }) => [
        evo(model, { goalForm: (form) => (form === null ? null : evo(form, { notes: () => value })) }),
        [],
      ],
      ChangedGoalStartDate: ({ value }) => [
        evo(model, { goalForm: (form) => (form === null ? null : evo(form, { startDate: () => value })) }),
        [],
      ],
      ChangedGoalTargetDate: ({ value }) => [
        evo(model, { goalForm: (form) => (form === null ? null : evo(form, { targetDate: () => value })) }),
        [],
      ],
      ChangedGoalWeight: ({ value }) => [
        evo(model, { goalForm: (form) => (form === null ? null : evo(form, { goalWeight: () => value })) }),
        [],
      ],
      ClickedCancelGoalForm: () => [evo(model, { goalForm: () => null }), []],
      ClickedEditGoal: () => {
        const bundle = AsyncData.getData(model.data)
        const goal = Option.isSome(bundle) ? bundle.value.goal : null
        if (goal === null) {
          return [model, []]
        }
        return [
          evo(model, {
            goalForm: () => ({
              editingId: goal.goal.id,
              error: null,
              goalWeight: String(goal.goal.goalWeight),
              notes: goal.goal.notes ?? '',
              startDate: goal.goal.startingDate,
              submitting: false,
              targetDate: goal.goal.targetDate ?? '',
            }),
          }),
          [],
        ]
      },
      ClickedSetGoal: () => [model, [OpenGoalForm({ timezone })]],
      ClickedStatsPreset: ({ preset }) => [model, [ApplyPreset({ preset, timezone })]],
      CommittedCustomRange: () => {
        if (model.customStart === '' || model.customEnd === '' || model.customStart >= model.customEnd) {
          return [model, []]
        }
        const start = Schema.decodeUnknownOption(CalendarDate)(model.customStart)
        const end = Schema.decodeUnknownOption(CalendarDate)(model.customEnd)
        return Option.isSome(start) && Option.isSome(end)
          ? [model, [NavigateStatsRange({ end: end.value, start: start.value })]]
          : [model, []]
      },
      ConfirmedDeleteGoal: ({ goalId }) => [evo(model, { goalDeleteConfirm: () => false }), [DeleteGoal({ goalId })]],
      FailedFetchStats: ({ key, message: error, requestedTimezone, requestGeneration }) =>
        isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)
          ? [evo(model, { data: () => AsyncData.Failure({ error }) }), []]
          : [model, []],
      NavigatedStats: () => [model, []],
      FailedSaveGoal: ({ message: error }) => [
        evo(model, {
          goalForm: (form) => (form === null ? null : evo(form, { error: () => error, submitting: () => false })),
        }),
        [],
      ],
      OpenedGoalForm: ({ todayLocal }) => [
        evo(model, {
          goalForm: () => ({
            editingId: null,
            error: null,
            goalWeight: '',
            notes: '',
            startDate: todayLocal,
            submitting: false,
            targetDate: '',
          }),
        }),
        [],
      ],
      RejectedFetchStats: ({ key, requestedTimezone, requestGeneration }) =>
        isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)
          ? [
              prepareStatsTimezoneReconciliation(model),
              [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
            ]
          : [model, []],
      RequestedDeleteGoal: () => [evo(model, { goalDeleteConfirm: () => true }), []],
      SubmittedGoalForm: ({ unit }) => {
        if (model.goalForm === null) {
          return [model, []]
        }
        const parsed = Number.parseFloat(model.goalForm.goalWeight)
        if (Number.isNaN(parsed) || parsed <= 0) {
          return [
            evo(model, {
              goalForm: (form) => (form === null ? null : evo(form, { error: () => 'Enter a valid goal weight' })),
            }),
            [],
          ]
        }
        const startDate = parseOptionalCalendarDate(model.goalForm.startDate)
        const targetDate = parseOptionalCalendarDate(model.goalForm.targetDate)
        if (Option.isNone(startDate) || Option.isNone(targetDate)) {
          return [
            evo(model, {
              goalForm: (form) => (form === null ? null : evo(form, { error: () => 'Enter valid goal dates' })),
            }),
            [],
          ]
        }
        const lbs = unit === 'kg' ? parsed * 2.2046226 : parsed
        return [
          evo(model, {
            goalForm: (form) => (form === null ? null : evo(form, { error: () => null, submitting: () => true })),
          }),
          [
            SaveGoal({
              editingId: model.goalForm.editingId,
              goalWeightLbs: lbs,
              notes: model.goalForm.notes,
              startDate: Option.getOrNull(startDate.value),
              targetDate: Option.getOrNull(targetDate.value),
            }),
          ],
        ]
      },
      SucceededDeleteGoal: () =>
        model.fetchedRange === null ? [model, []] : startStatsFetch(model, splitRangeKey(model.fetchedRange), timezone),
      SucceededFetchStats: ({ bundle, key, requestedTimezone, requestGeneration, timezone: responseTimezone }) => {
        if (!isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)) {
          return [model, []]
        }
        return responseTimezone === timezone
          ? [evo(model, { data: () => AsyncData.succeed(bundle), fetchedRange: () => key }), []]
          : [
              prepareStatsTimezoneReconciliation(model),
              [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
            ]
      },
      SucceededSaveGoal: () => {
        const next = evo(model, { goalForm: () => null })
        return model.fetchedRange === null
          ? [next, []]
          : startStatsFetch(next, splitRangeKey(model.fetchedRange), timezone)
      },
    })
  )
}

// ============================================
// Views
// ============================================

const h = html<StatsMessage>()

type Html = ReturnType<typeof h.div>

const viewCard = (title: string, content: Html) =>
  h.div(
    [h.Class(card())],
    [
      h.div(
        [h.Class('flex flex-col space-y-1.5 p-4 sm:p-6')],
        [h.h3([h.Class('text-sm font-semibold uppercase tracking-wider text-muted-foreground')], [title])]
      ),
      h.div([h.Class('p-4 pt-0 sm:p-6 sm:pt-0')], [content]),
    ]
  )

const viewStatGrid = (items: ReadonlyArray<readonly [string, string]>, columns: string) =>
  h.div(
    [h.Class(`grid grid-cols-2 gap-3 ${columns}`)],
    items.map(([label, value]) =>
      h.div(
        [],
        [
          h.div([h.Class('text-xs text-muted-foreground')], [label]),
          h.div([h.Class('text-lg font-semibold font-mono')], [value]),
        ]
      )
    )
  )

const PRESETS: ReadonlyArray<readonly ['1m' | '3m' | '6m' | '1y' | 'all', string]> = [
  ['1m', '1 Month'],
  ['3m', '3 Months'],
  ['6m', '6 Months'],
  ['1y', '1 Year'],
  ['all', 'All Time'],
]

const activePresetOf = (range: StatsRange): Option.Option<'1m' | '3m' | '6m' | '1y' | 'all'> =>
  Option.isNone(range.start) && Option.isNone(range.end) ? Option.some('all') : Option.none()

const viewRangeSelector = (model: StatsModel, range: StatsRange) => {
  const active = activePresetOf(range)
  return h.div(
    [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4')],
    [
      h.div(
        [h.Class('flex gap-2 flex-wrap')],
        PRESETS.map(([key, label]) =>
          h.button(
            [
              h.Class(
                button({
                  size: 'sm',
                  variant: Option.exists(active, (preset) => preset === key) ? 'default' : 'outline',
                })
              ),
              h.OnClick(ClickedStatsPreset({ preset: key })),
            ],
            [label]
          )
        )
      ),
      Option.isNone(active)
        ? h.div(
            [h.Class('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3')],
            [
              h.span([h.Class('text-sm text-muted-foreground')], ['From']),
              h.input([
                h.Class(input({ class: 'w-auto font-mono h-8 px-2' })),
                h.Type('date'),
                h.Value(model.customStart),
                h.OnInput((value) => ChangedCustomStart({ value })),
                h.OnBlur(CommittedCustomRange()),
              ]),
              h.span([h.Class('text-sm text-muted-foreground')], ['to']),
              h.input([
                h.Class(input({ class: 'w-auto font-mono h-8 px-2' })),
                h.Type('date'),
                h.Value(model.customEnd),
                h.OnInput((value) => ChangedCustomEnd({ value })),
                h.OnBlur(CommittedCustomRange()),
              ]),
              h.button(
                [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(ClickedStatsPreset({ preset: 'all' }))],
                ['Reset']
              ),
            ]
          )
        : h.empty,
    ]
  )
}

// ---- Pie chart (pure SVG, replaces recharts SimplePieChart) ----

const viewPieChart = (data: ReadonlyArray<readonly [string, number]>) => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div([h.Class('text-muted-foreground h-[200px] flex items-center justify-center')], ['No data available'])
  }
  // d3's pie generator method, not Array#sort — null disables slice reordering
  // oxlint-disable-next-line effect/prefer-arr-sort
  const pie = d3
    .pie<readonly [string, number]>()
    .value(([, value]) => value)
    .padAngle(0.035)
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort(null)
  const arc = d3.arc<d3.PieArcDatum<readonly [string, number]>>().innerRadius(50).outerRadius(80)
  const labelArc = d3.arc<d3.PieArcDatum<readonly [string, number]>>().innerRadius(65).outerRadius(65)
  const arcs = pie([...data])
  const attr = h.Attribute
  return h.div(
    [h.Class('flex items-center justify-center gap-6 h-[250px]')],
    [
      h.svg(
        [h.ViewBox('-90 -90 180 180'), h.Class('h-[180px] w-[180px] shrink-0')],
        arcs.map((slice, index) => {
          const d = arc(slice)
          const [lx, ly] = labelArc.centroid(slice)
          return h.g(
            [],
            [
              d === null
                ? h.empty
                : h.path(
                    [
                      attr('d', d),
                      h.Fill(CHART_COLORS[index % CHART_COLORS.length] ?? '#0891b2'),
                      h.Stroke('var(--card)'),
                      h.StrokeWidth('2'),
                    ],
                    []
                  ),
              slice.data[1] > 0
                ? h.text(
                    [
                      attr('x', String(lx)),
                      attr('y', String(ly)),
                      h.TextAnchor('middle'),
                      h.Dy('0.35em'),
                      h.Fill('#fff'),
                      h.FontSize('11px'),
                      h.FontWeight('600'),
                    ],
                    [String(slice.data[1])]
                  )
                : h.empty,
            ]
          )
        })
      ),
      h.div(
        [h.Class('flex flex-col gap-1.5')],
        data.map(([name, value], index) =>
          h.div(
            [h.Class('flex items-center gap-2')],
            [
              h.span(
                [
                  h.Class('inline-block h-3 w-3 shrink-0'),
                  h.Style({ background: CHART_COLORS[index % CHART_COLORS.length] ?? '#0891b2' }),
                ],
                []
              ),
              h.span([h.Class('text-xs text-muted-foreground')], [`${name} (${value})`]),
            ]
          )
        )
      ),
    ]
  )
}

// ---- Horizontal bar chart (pure HTML, replaces recharts) ----

const viewBarChart = (data: ReadonlyArray<readonly [string, number]>) => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div([h.Class('text-muted-foreground h-[100px] flex items-center justify-center')], ['No data available'])
  }
  const max = Math.max(...data.map(([, value]) => value), 1)
  return h.div(
    [h.Class('flex flex-col gap-3 py-2')],
    data.map(([name, value], index) =>
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          h.span([h.Class('w-20 shrink-0 text-xs text-right truncate'), h.Title(name)], [name]),
          h.div(
            [h.Class('flex-1 flex items-center gap-2')],
            [
              h.div(
                [
                  h.Class('h-6 rounded-r'),
                  h.Style({
                    background: CHART_COLORS[index % CHART_COLORS.length] ?? '#0891b2',
                    width: `${((value / max) * 100).toFixed(1)}%`,
                  }),
                ],
                []
              ),
              h.span([h.Class('text-xs text-muted-foreground')], [String(value)]),
            ]
          ),
        ]
      )
    )
  )
}

// ---- Dose history step chart (pure SVG) ----

const DOSE_W = 800
const DOSE_H = 200

interface DosePoint {
  readonly date: Date
  readonly drug: string
  readonly doseMg: number
  readonly color: string
}

interface DoseSegment {
  readonly points: ReadonlyArray<DosePoint>
  readonly color: string
}

interface DoseSegmentBuild {
  readonly segments: ReadonlyArray<DoseSegment>
  readonly current: ReadonlyArray<DosePoint>
  readonly color: string
}

const flushDoseSegment = (build: DoseSegmentBuild): ReadonlyArray<DoseSegment> =>
  Arr.isReadonlyArrayNonEmpty(build.current)
    ? [...build.segments, { color: build.color, points: build.current }]
    : build.segments

const viewDoseHistory = (data: DoseHistoryStats, timezone: IanaTimezone) => {
  if (Arr.isReadonlyArrayEmpty(data.points)) {
    return h.div([h.Class('text-muted-foreground h-[200px]')], ['No dose data available'])
  }
  const margin = { bottom: 40, left: 50, right: 20, top: 20 }
  const width = DOSE_W - margin.left - margin.right
  const height = DOSE_H - margin.top - margin.bottom
  const points: ReadonlyArray<DosePoint> = [...data.points]
    .map((point) => ({
      color: getDoseColor(`${point.drug}::${point.doseMg}`),
      date: point.date,
      doseMg: point.doseMg,
      drug: point.drug,
    }))
    .toSorted((a, b) => a.date.getTime() - b.date.getTime())
  const [minDate, maxDate] = d3.extent(points, (point) => point.date)
  const [minDose, maxDose] = d3.extent(points, (point) => point.doseMg)
  if (minDate === undefined || maxDate === undefined || minDose === undefined || maxDose === undefined) {
    return h.empty
  }
  const xScale = d3.scaleUtc().domain([minDate, maxDate]).range([0, width])
  const yPadding = (maxDose - minDose) * 0.2 || 2
  const yScale = d3
    .scaleLinear()
    .domain([Math.max(0, minDose - yPadding), maxDose + yPadding])
    .range([height, 0])
  const line = d3
    .line<DosePoint>()
    .x((point) => xScale(point.date))
    .y((point) => yScale(point.doseMg))
    .curve(d3.curveStepAfter)
  const segmentInitial: DoseSegmentBuild = { color: '', current: [], segments: [] }
  const builtSegments = Arr.reduce(points, segmentInitial, (build, point) => {
    if (point.color === build.color) {
      return { ...build, current: [...build.current, point] }
    }
    const seed = Arr.isReadonlyArrayNonEmpty(build.current) ? [Arr.lastNonEmpty(build.current), point] : [point]
    return { color: point.color, current: seed, segments: flushDoseSegment(build) }
  })
  const segments = flushDoseSegment(builtSegments)
  const attr = h.Attribute
  const formatDoseDate = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone }).format(date)
  const formatTick = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: timezone }).format(date)
  return h.div(
    [h.Class('relative w-full')],
    [
      h.svg(
        [h.ViewBox(`0 0 ${DOSE_W} ${DOSE_H}`), h.Class('block w-full h-auto')],
        [
          h.g(
            [h.Transform(`translate(${margin.left},${margin.top})`)],
            [
              ...yScale
                .ticks(5)
                .map((tick) =>
                  h.line(
                    [
                      attr('x1', '0'),
                      attr('x2', String(width)),
                      attr('y1', String(yScale(tick))),
                      attr('y2', String(yScale(tick))),
                      h.Stroke('currentColor'),
                      h.Opacity('0.1'),
                    ],
                    []
                  )
                ),
              ...segments.flatMap((segment) => {
                if (segment.points.length < 2) {
                  return []
                }
                const d = line([...segment.points])
                return d === null
                  ? []
                  : [h.path([attr('d', d), h.Fill('none'), h.Stroke(segment.color), h.StrokeWidth('2')], [])]
              }),
              ...points.map((point) =>
                h.circle(
                  [
                    h.Cx(String(xScale(point.date))),
                    h.Cy(String(yScale(point.doseMg))),
                    attr('r', '4'),
                    h.Fill(point.color),
                    h.Stroke('var(--card)'),
                    h.StrokeWidth('2'),
                    h.Cursor('pointer'),
                    h.AriaLabel(`${point.drug} ${point.doseMg} mg on ${formatDoseDate(point.date)}`),
                  ],
                  []
                )
              ),
              h.g(
                [h.Transform(`translate(0,${height})`)],
                [
                  h.line([attr('x1', '0'), attr('x2', String(width)), h.Stroke('#e5e7eb')], []),
                  ...xScale
                    .ticks(5)
                    .map((tick) =>
                      h.text(
                        [
                          attr('x', String(xScale(tick))),
                          attr('y', '20'),
                          h.TextAnchor('middle'),
                          h.Fill('#9ca3af'),
                          h.FontSize('10px'),
                        ],
                        [formatTick(tick)]
                      )
                    ),
                ]
              ),
              h.g(
                [],
                yScale
                  .ticks(5)
                  .map((tick) =>
                    h.text(
                      [
                        attr('x', '-8'),
                        attr('y', String(yScale(tick) + 3)),
                        h.TextAnchor('end'),
                        h.Fill('#9ca3af'),
                        h.FontSize('10px'),
                      ],
                      [`${tick} mg`]
                    )
                  )
              ),
            ]
          ),
        ]
      ),
    ]
  )
}

// ---- Goal card ----

const goalSubmitLabel = (form: GoalForm): string => {
  if (form.submitting) {
    return 'Saving...'
  }
  return form.editingId === null ? 'Set Goal' : 'Save Changes'
}

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

const PACE_BADGES: Record<GoalProgress['paceStatus'], { readonly label: string; readonly classes: string }> = {
  ahead: { classes: 'bg-green-100 text-green-800', label: 'Ahead of pace' },
  behind: { classes: 'bg-yellow-100 text-yellow-800', label: 'Behind pace' },
  not_losing: { classes: 'bg-gray-100 text-gray-800', label: 'Not losing' },
  on_track: { classes: 'bg-blue-100 text-blue-800', label: 'On track' },
}

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

const goalCardContent = (model: StatsModel, goal: Option.Option<GoalProgress>, unit: WeightUnit) => {
  const show = (lbs: number): number => displayWeight(unit, lbs)
  if (model.goalForm !== null) {
    return viewGoalForm(model.goalForm, unit)
  }
  if (model.goalDeleteConfirm && Option.isSome(goal)) {
    return h.div(
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
                h.OnClick(ConfirmedDeleteGoal({ goalId: goal.value.goal.id })),
              ],
              ['Delete Goal']
            ),
          ]
        ),
      ]
    )
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
  const progress = goal.value
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
                  h.button([h.Class(button({ size: 'sm', variant: 'ghost' })), h.OnClick(ClickedEditGoal())], ['Edit']),
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

const viewGoalCard = (model: StatsModel, goal: Option.Option<GoalProgress>, unit: WeightUnit) =>
  viewCard('Goal Progress', goalCardContent(model, goal, unit))

// ---- Page ----

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Ended schedules display their final included local day, while chart
// geometry uses the following local-day boundary as an exclusive end.
const finiteScheduleDays = (schedule: InjectionSchedule): Option.Option<number> => {
  if (schedule.isActive) {
    return Option.none()
  }
  const orderedPhases = Arr.sortWith(schedule.phases, (phase) => phase.order, Order.Number)
  const durationDays = Arr.flatMap(orderedPhases, (phase) => (phase.durationDays === null ? [] : [phase.durationDays]))
  return Arr.isReadonlyArrayEmpty(durationDays)
    ? Option.none()
    : Option.some(Arr.reduce(durationDays, 0, (sum, days) => sum + days))
}

export const scheduleEndDate = (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date> =>
  Option.map(finiteScheduleDays(schedule), (totalDays) =>
    calendarDateStartUtc(addCalendarDays(schedule.startDate, totalDays - 1), timezone).pipe(DateTime.toDate)
  )

export const scheduleEndExclusiveDate = (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date> =>
  Option.map(finiteScheduleDays(schedule), (totalDays) =>
    calendarDateStartUtc(addCalendarDays(schedule.startDate, totalDays), timezone).pipe(DateTime.toDate)
  )

const viewBundle = (
  model: StatsModel,
  bundle: StatsBundle,
  unit: WeightUnit,
  range: StatsRange,
  timezone: IanaTimezone
) => {
  const show = (lbs: number): number => displayWeight(unit, lbs)
  const weightItems: ReadonlyArray<readonly [string, string]> =
    bundle.weightStats === null
      ? []
      : [
          ['Min', formatWeight(unit, bundle.weightStats.minWeight)],
          ['Max', formatWeight(unit, bundle.weightStats.maxWeight)],
          ['Average', formatWeight(unit, bundle.weightStats.avgWeight)],
          [
            'Rate',
            `${bundle.weightStats.rateOfChange >= 0 ? '+' : ''}${show(Math.abs(bundle.weightStats.rateOfChange)).toFixed(2)} ${unit}/wk`,
          ],
          ['Entries', String(bundle.weightStats.entryCount)],
        ]

  const frequencyItems: ReadonlyArray<readonly [string, string]> =
    bundle.frequency === null
      ? []
      : [
          ['Total Injections', String(bundle.frequency.totalInjections)],
          ['Avg Days Between', bundle.frequency.avgDaysBetween.toFixed(1)],
          ['Per Week', bundle.frequency.injectionsPerWeek.toFixed(1)],
          [
            'Most Common Day',
            bundle.frequency.mostFrequentDayOfWeek === null
              ? 'N/A'
              : (DAY_NAMES[bundle.frequency.mostFrequentDayOfWeek] ?? 'Unknown'),
          ],
        ]

  const weightData: ReadonlyArray<WeightPoint> = bundle.weightTrend.points.map((point) => ({
    date: point.date,
    notes: Option.none(),
    weight: point.weight,
  }))
  const injectionData: ReadonlyArray<InjectionPoint> = bundle.injections.map((injection) => ({
    date: DateTime.toDate(injection.datetime),
    doseMg: injection.doseMg,
    drug: injection.drug,
  }))
  const schedulePeriods: ReadonlyArray<SchedulePeriod> = bundle.schedules.map((schedule) => ({
    drug: schedule.drug,
    endDateExclusive: scheduleEndExclusiveDate(schedule, timezone),
    endDateInclusive: scheduleEndDate(schedule, timezone),
    scheduleName: schedule.name,
    startDate: calendarDateStartUtc(schedule.startDate, timezone).pipe(DateTime.toDate),
  }))
  const zoomRange: Option.Option<{ readonly start: Date; readonly end: Date }> = Option.all([
    range.start,
    range.end,
  ]).pipe(
    Option.map(([start, end]) => ({
      end: DateTime.toDate(
        DateTime.makeUnsafe(DateTime.toEpochMillis(calendarDateStartUtc(addCalendarDays(end, 1), timezone)) - 1)
      ),
      start: DateTime.toDate(calendarDateStartUtc(start, timezone)),
    }))
  )

  return h.div(
    [h.Class('grid gap-5')],
    [
      viewGoalCard(model, Option.fromNullishOr(bundle.goal), unit),
      viewCard(
        'Weight Statistics',
        Arr.isReadonlyArrayEmpty(weightItems)
          ? h.div([h.Class('text-muted-foreground')], ['No weight data available'])
          : viewStatGrid(weightItems, 'sm:grid-cols-3 lg:grid-cols-5')
      ),
      viewCard(
        'Weight Trend',
        Arr.isReadonlyArrayNonEmpty(weightData)
          ? viewWeightTrend({
              displayWeight: show,
              injectionData,
              schedulePeriods,
              state: model.chart,
              timezone,
              trendLine: Option.fromNullishOr(bundle.weightTrend.trendLine),
              unitLabel: unit,
              weightData,
              zoomRange,
            })
          : h.div([h.Class('text-muted-foreground h-[200px]')], ['No weight data available'])
      ),
      viewCard(
        'Injection Frequency',
        Arr.isReadonlyArrayEmpty(frequencyItems)
          ? h.div([h.Class('text-muted-foreground')], ['No injection data available'])
          : viewStatGrid(frequencyItems, 'sm:grid-cols-4')
      ),
      h.div(
        [h.Class('grid gap-5 md:grid-cols-2 xl:grid-cols-3')],
        [
          viewCard('Injection Sites', viewPieChart(bundle.siteStats.sites.map((site) => [site.site, site.count]))),
          viewCard(
            'Injections by Day of Week',
            viewPieChart(bundle.dayOfWeek.days.map((day) => [DAY_NAMES[day.dayOfWeek] ?? 'Unknown', day.count]))
          ),
          viewCard('Medications Used', viewBarChart(bundle.drugBreakdown.drugs.map((drug) => [drug.drug, drug.count]))),
        ]
      ),
      viewCard('Dose History', viewDoseHistory(bundle.doseHistory, timezone)),
    ]
  )
}

export const viewStats = (model: StatsModel, unit: WeightUnit, range: StatsRange, timezone: IanaTimezone) =>
  h.div(
    [],
    [
      h.div([h.Class('mb-6')], [viewRangeSelector(model, range)]),
      AsyncData.match(model.data, {
        onFailure: () =>
          h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
        onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onRefreshing: (bundle) => viewBundle(model, bundle, unit, range, timezone),
        onStale: ({ data }) => viewBundle(model, data, unit, range, timezone),
        onSuccess: (bundle) => viewBundle(model, bundle, unit, range, timezone),
      }),
    ]
  )
