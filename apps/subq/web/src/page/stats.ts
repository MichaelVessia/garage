import * as d3 from 'd3'
import { DateTime, Effect, Match, Option, Schema } from 'effect'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'

import {
  DosageHistoryStats,
  GoalId,
  DrugBreakdownStats,
  GoalProgress,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionLog,
  InjectionLogListParams,
  InjectionSchedule,
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
  getDosageColor,
  initialChartState,
  updateChart,
  viewWeightTrend,
} from '../chart/weight-trend.js'
import { displayWeight, formatWeight } from '../data/settings.js'
import { epochToDate, fromLocalDatetimeString, toLocalDatetimeString } from '../lib/datetime.js'
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
  dosageHistory: DosageHistoryStats,
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
  // range key ("startIso|endIso") the current `data` was fetched for
  fetchedRange: Schema.NullOr(Schema.String),
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
  goalDeleteConfirm: false,
  goalForm: null,
}

export interface StatsRange {
  readonly start: string | null
  readonly end: string | null
}

export const rangeKey = (range: StatsRange): string => `${range.start ?? ''}|${range.end ?? ''}`

// ============================================
// Messages
// ============================================

export const SucceededFetchStats = m('SucceededFetchStats', {
  key: Schema.String,
  bundle: StatsBundle,
})
export const FailedFetchStats = m('FailedFetchStats', { message: Schema.String })
export const ClickedStatsPreset = m('ClickedStatsPreset', {
  preset: Schema.Literals(['1m', '3m', '6m', '1y', 'all']),
})
export const ChangedCustomStart = m('ChangedCustomStart', { value: Schema.String })
export const ChangedCustomEnd = m('ChangedCustomEnd', { value: Schema.String })
export const CommittedCustomRange = m('CommittedCustomRange')
export const ClickedSetGoal = m('ClickedSetGoal')
export const OpenedGoalForm = m('OpenedGoalForm', { todayLocal: Schema.String })
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

export const StatsMessage = Schema.Union([
  SucceededFetchStats,
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

const toStatsParams = (range: StatsRange, timezone?: string): StatsParams =>
  new StatsParams({
    endDate: range.end === null ? undefined : fromLocalDatetimeString(`${range.end}T23:59`).pipe(DateTime.toDate),
    startDate: range.start === null ? undefined : fromLocalDatetimeString(`${range.start}T00:00`).pipe(DateTime.toDate),
    ...(timezone === undefined ? {} : { timezone }),
  })

export const FetchStats = Command.define(
  'FetchStats',
  { start: Schema.NullOr(Schema.String), end: Schema.NullOr(Schema.String) },
  SucceededFetchStats,
  FailedFetchStats
)(({ end, start }) =>
  Effect.gen(function* () {
    const api = yield* Api
    const range: StatsRange = { end, start }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const params = toStatsParams(range)
    const tzParams = toStatsParams(range, timezone)
    const listParams = new InjectionLogListParams({
      endDate: range.end === null ? undefined : fromLocalDatetimeString(`${range.end}T23:59`),
      limit: Limit.make(10_000),
      offset: Offset.make(0),
      startDate: range.start === null ? undefined : fromLocalDatetimeString(`${range.start}T00:00`),
    })
    const bundle = yield* Effect.all(
      {
        dayOfWeek: api.GetInjectionByDayOfWeek(tzParams),
        dosageHistory: api.GetDosageHistory(params),
        drugBreakdown: api.GetDrugBreakdown(params),
        frequency: api.GetInjectionFrequency(tzParams),
        goal: api.GoalGetProgress(),
        injections: api.InjectionLogList(listParams),
        schedules: api.ScheduleList(),
        siteStats: api.GetInjectionSiteStats(params),
        weightStats: api.GetWeightStats(params),
        weightTrend: api.GetWeightTrend(params),
      },
      { concurrency: 'unbounded' }
    )
    return SucceededFetchStats({ bundle, key: rangeKey(range) })
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedFetchStats({ message: 'Failed to load stats' }))))
)

// Preset click → compute range from "now" → push URL (route change refetches)
const ApplyPreset = Command.define(
  'ApplyPreset',
  { preset: Schema.Literals(['1m', '3m', '6m', '1y', 'all']) },
  NavigatedStats
)(({ preset }) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    const end = DateTime.toDate(now)
    const start = DateTime.toDate(now)
    if (preset === '1m') {
      start.setMonth(start.getMonth() - 1)
    }
    if (preset === '3m') {
      start.setMonth(start.getMonth() - 3)
    }
    if (preset === '6m') {
      start.setMonth(start.getMonth() - 6)
    }
    if (preset === '1y') {
      start.setFullYear(start.getFullYear() - 1)
    }
    const href =
      preset === 'all'
        ? statsRouter({ end: Option.none(), start: Option.none() })
        : statsRouter({
            end: Option.some(toLocalDatetimeString(end).slice(0, 10)),
            start: Option.some(toLocalDatetimeString(start).slice(0, 10)),
          })
    yield* pushUrl(href)
    return NavigatedStats()
  })
)

const NavigateStatsRange = Command.define(
  'NavigateStatsRange',
  { start: Schema.String, end: Schema.String },
  NavigatedStats
)(({ end, start }) =>
  pushUrl(statsRouter({ end: Option.some(end), start: Option.some(start) })).pipe(Effect.as(NavigatedStats()))
)

const OpenGoalForm = Command.define(
  'OpenGoalForm',
  OpenedGoalForm
)(
  DateTime.now.pipe(
    Effect.map((now) => OpenedGoalForm({ todayLocal: toLocalDatetimeString(DateTime.toDate(now)).slice(0, 10) }))
  )
)

const SaveGoal = Command.define(
  'SaveGoal',
  {
    editingId: Schema.NullOr(GoalId),
    goalWeightLbs: Schema.Number,
    startDate: Schema.String,
    targetDate: Schema.String,
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
            startingDate: startDate === '' ? Option.none() : Option.some(fromLocalDatetimeString(`${startDate}T00:00`)),
            targetDate: targetDate === '' ? Option.none() : Option.some(fromLocalDatetimeString(`${targetDate}T00:00`)),
          })
        )
      : api.GoalUpdate(
          new UserGoalUpdate({
            goalWeight: Weight.make(goalWeightLbs),
            id: editingId,
            notes: notes === '' ? null : Notes.make(notes),
            startingDate: startDate === '' ? undefined : fromLocalDatetimeString(`${startDate}T00:00`),
            targetDate: targetDate === '' ? null : fromLocalDatetimeString(`${targetDate}T00:00`),
          })
        )
    return SucceededSaveGoal()
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedSaveGoal({ message: 'Failed to save goal' }))))
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
  }).pipe(Effect.catchCause(() => Effect.succeed(FailedSaveGoal({ message: 'Failed to delete goal' }))))
)

// ============================================
// Update
// ============================================

type StatsCommands = ReadonlyArray<Command.Command<StatsMessage | typeof NavigatedStats.Type, never, Api>>
type UpdateReturn = readonly [StatsModel, StatsCommands]

// Called by the app root when the stats route is entered or its range changes.
export const syncStatsFetch = (model: StatsModel, range: StatsRange): UpdateReturn => {
  const key = rangeKey(range)
  if (model.fetchedRange === key && !AsyncData.isIdle(model.data)) {
    return [model, []]
  }
  return [
    evo(model, {
      customEnd: () => range.end ?? '',
      customStart: () => range.start ?? '',
      data: () => AsyncData.Loading(),
      fetchedRange: () => key,
    }),
    [FetchStats({ end: range.end, start: range.start })],
  ]
}

const splitRangeKey = (key: string): { readonly start: string | null; readonly end: string | null } => {
  const [start, end] = key.split('|')
  return {
    end: end === undefined || end === '' ? null : end,
    start: start === undefined || start === '' ? null : start,
  }
}

const isChartMessage = Schema.is(ChartMessage)

export const updateStats = (model: StatsModel, message: StatsMessage): UpdateReturn => {
  if (isChartMessage(message)) {
    const [chart, zoom] = updateChart(model.chart, message)
    const next = evo(model, { chart: () => chart })
    if (zoom === null) {
      return [next, []]
    }
    const start = toLocalDatetimeString(epochToDate(zoom.startMs)).slice(0, 10)
    const end = toLocalDatetimeString(epochToDate(zoom.endMs)).slice(0, 10)
    return [next, [NavigateStatsRange({ end, start })]]
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
              startDate: DateTime.formatIso(goal.goal.startingDate).slice(0, 10),
              submitting: false,
              targetDate: goal.goal.targetDate === null ? '' : DateTime.formatIso(goal.goal.targetDate).slice(0, 10),
            }),
          }),
          [],
        ]
      },
      ClickedSetGoal: () => [model, [OpenGoalForm()]],
      ClickedStatsPreset: ({ preset }) => [model, [ApplyPreset({ preset })]],
      CommittedCustomRange: () => {
        if (model.customStart === '' || model.customEnd === '' || model.customStart >= model.customEnd) {
          return [model, []]
        }
        return [model, [NavigateStatsRange({ end: model.customEnd, start: model.customStart })]]
      },
      ConfirmedDeleteGoal: ({ goalId }) => [evo(model, { goalDeleteConfirm: () => false }), [DeleteGoal({ goalId })]],
      FailedFetchStats: ({ message: error }) => [evo(model, { data: () => AsyncData.Failure({ error }) }), []],
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
        const lbs = unit === 'kg' ? parsed * 2.204_622_6 : parsed
        return [
          evo(model, {
            goalForm: (form) => (form === null ? null : evo(form, { error: () => null, submitting: () => true })),
          }),
          [
            SaveGoal({
              editingId: model.goalForm.editingId,
              goalWeightLbs: lbs,
              notes: model.goalForm.notes,
              startDate: model.goalForm.startDate,
              targetDate: model.goalForm.targetDate,
            }),
          ],
        ]
      },
      SucceededDeleteGoal: () => [
        evo(model, { data: () => AsyncData.Loading(), fetchedRange: () => null }),
        model.fetchedRange === null ? [] : [FetchStats(splitRangeKey(model.fetchedRange))],
      ],
      SucceededFetchStats: ({ bundle, key }) => [
        evo(model, { data: () => AsyncData.succeed(bundle), fetchedRange: () => key }),
        [],
      ],
      SucceededSaveGoal: () => [
        evo(model, { data: () => AsyncData.Loading(), goalForm: () => null }),
        model.fetchedRange === null ? [] : [FetchStats(splitRangeKey(model.fetchedRange))],
      ],
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

const activePresetOf = (range: StatsRange): '1m' | '3m' | '6m' | '1y' | 'all' | null => {
  if (range.start === null && range.end === null) {
    return 'all'
  }
  return null
}

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
              h.Class(button({ size: 'sm', variant: active === key ? 'default' : 'outline' })),
              h.OnClick(ClickedStatsPreset({ preset: key })),
            ],
            [label]
          )
        )
      ),
      active === null
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
  if (data.length === 0) {
    return h.div([h.Class('text-muted-foreground h-[200px] flex items-center justify-center')], ['No data available'])
  }
  const pie = d3
    .pie<readonly [string, number]>()
    .value(([, value]) => value)
    .padAngle(0.035)
    // d3's pie generator method, not Array#sort — null disables slice reordering
    // eslint-disable-next-line unicorn/no-array-sort
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
  if (data.length === 0) {
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

// ---- Dosage history step chart (pure SVG) ----

const DOSAGE_W = 800
const DOSAGE_H = 200

const viewDosageHistory = (data: DosageHistoryStats) => {
  if (data.points.length === 0) {
    return h.div([h.Class('text-muted-foreground h-[200px]')], ['No dosage data available'])
  }
  const margin = { bottom: 40, left: 50, right: 20, top: 20 }
  const width = DOSAGE_W - margin.left - margin.right
  const height = DOSAGE_H - margin.top - margin.bottom
  interface DosagePoint {
    readonly date: Date
    readonly drug: string
    readonly dosage: string
    readonly dosageValue: number
    readonly color: string
  }
  const points: ReadonlyArray<DosagePoint> = [...data.points]
    .map((point) => ({
      color: getDosageColor(`${point.drug}::${point.dosage}`),
      date: point.date,
      dosage: point.dosage,
      dosageValue: point.dosageValue,
      drug: point.drug,
    }))
    .toSorted((a, b) => a.date.getTime() - b.date.getTime())
  const [minDate, maxDate] = d3.extent(points, (point) => point.date)
  const [minDosage, maxDosage] = d3.extent(points, (point) => point.dosageValue)
  if (minDate === undefined || maxDate === undefined || minDosage === undefined || maxDosage === undefined) {
    return h.empty
  }
  const xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, width])
  const yPadding = (maxDosage - minDosage) * 0.2 || 2
  const yScale = d3
    .scaleLinear()
    .domain([Math.max(0, minDosage - yPadding), maxDosage + yPadding])
    .range([height, 0])
  const line = d3
    .line<DosagePoint>()
    .x((point) => xScale(point.date))
    .y((point) => yScale(point.dosageValue))
    .curve(d3.curveStepAfter)
  const segments: Array<{ readonly points: Array<DosagePoint>; readonly color: string }> = []
  let current: Array<DosagePoint> = []
  let color = ''
  for (const point of points) {
    if (point.color !== color) {
      if (current.length > 0) {
        segments.push({ color, points: current })
        const last = current.at(-1)
        current = last === undefined ? [] : [last]
      }
      ;({ color } = point)
    }
    current.push(point)
  }
  if (current.length > 0) {
    segments.push({ color, points: current })
  }
  const attr = h.Attribute
  const formatDate = d3.timeFormat('%b %d, %Y')
  const formatTick = d3.timeFormat('%b %d')
  return h.div(
    [h.Class('relative w-full')],
    [
      h.svg(
        [h.ViewBox(`0 0 ${DOSAGE_W} ${DOSAGE_H}`), h.Class('block w-full h-auto')],
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
                const d = line(segment.points)
                return d === null
                  ? []
                  : [h.path([attr('d', d), h.Fill('none'), h.Stroke(segment.color), h.StrokeWidth('2')], [])]
              }),
              ...points.map((point) =>
                h.circle(
                  [
                    h.Cx(String(xScale(point.date))),
                    h.Cy(String(yScale(point.dosageValue))),
                    attr('r', '4'),
                    h.Fill(point.color),
                    h.Stroke('var(--card)'),
                    h.StrokeWidth('2'),
                    h.Cursor('pointer'),
                    h.AriaLabel(`${point.drug} ${point.dosage} on ${formatDate(point.date)}`),
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
                      [`${tick}mg`]
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

const goalCardContent = (model: StatsModel, goal: GoalProgress | null, unit: WeightUnit) => {
  const show = (lbs: number): number => displayWeight(unit, lbs)
  const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
  if (model.goalForm !== null) {
    return viewGoalForm(model.goalForm, unit)
  }
  if (model.goalDeleteConfirm && goal !== null) {
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
                h.OnClick(ConfirmedDeleteGoal({ goalId: goal.goal.id })),
              ],
              ['Delete Goal']
            ),
          ]
        ),
      ]
    )
  }
  if (goal === null) {
    return h.div(
      [h.Class('flex flex-col items-start gap-3')],
      [
        h.p([h.Class('text-sm text-muted-foreground')], ['Set a goal to track your progress.']),
        h.button([h.Class(button()), h.OnClick(ClickedSetGoal())], ['Set Your Goal']),
      ]
    )
  }
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
                  paceBadge(goal.paceStatus),
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
                  h.Style({ width: `${Math.min(100, Math.max(0, goal.percentComplete)).toFixed(0)}%` }),
                ],
                []
              ),
            ]
          ),
          h.div(
            [h.Class('flex justify-between mt-2 text-sm')],
            [
              h.span([h.Class('font-mono')], [`${show(goal.goal.startingWeight).toFixed(1)} ${unit}`]),
              h.span([h.Class('font-semibold')], [`${goal.percentComplete.toFixed(0)}%`]),
              h.span([h.Class('font-mono')], [`${show(goal.goal.goalWeight).toFixed(1)} ${unit}`]),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class('grid grid-cols-2 sm:grid-cols-4 gap-4')],
        [
          goalStat('Lost', show(goal.lbsLost).toFixed(1), unit),
          goalStat('To Go', show(goal.lbsRemaining).toFixed(1), unit),
          goalStat('Avg/Week', show(goal.avgLbsPerWeek).toFixed(2), unit),
          goalStat('Days', String(goal.daysOnPlan), 'on plan'),
        ]
      ),
      goal.projectedDate === null
        ? h.empty
        : h.div(
            [h.Class('p-3 bg-muted/50 rounded-lg')],
            [
              h.span([h.Class('text-sm text-muted-foreground')], ['Projected goal date: ']),
              h.span([h.Class('font-semibold')], [dateFormat.format(DateTime.toDate(goal.projectedDate))]),
            ]
          ),
    ]
  )
}

const viewGoalCard = (model: StatsModel, goal: GoalProgress | null, unit: WeightUnit) =>
  viewCard('Goal Progress', goalCardContent(model, goal, unit))

// ---- Page ----

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const viewBundle = (model: StatsModel, bundle: StatsBundle, unit: WeightUnit, range: StatsRange) => {
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
    notes: null,
    weight: point.weight,
  }))
  const injectionData: ReadonlyArray<InjectionPoint> = bundle.injections.map((injection) => ({
    date: DateTime.toDate(injection.datetime),
    dosage: injection.dosage,
    drug: injection.drug,
  }))
  const schedulePeriods: ReadonlyArray<SchedulePeriod> = bundle.schedules.map((schedule) => {
    let endDate: Date | null = null
    if (!schedule.isActive) {
      let cursor = DateTime.toDate(schedule.startDate)
      for (const phase of [...schedule.phases].toSorted((a, b) => a.order - b.order)) {
        if (phase.durationDays !== null) {
          cursor = epochToDate(cursor.getTime() + phase.durationDays * 24 * 60 * 60 * 1000)
          endDate = cursor
        }
      }
    }
    return {
      drug: schedule.drug,
      endDate,
      scheduleName: schedule.name,
      startDate: DateTime.toDate(schedule.startDate),
    }
  })
  const zoomRange =
    range.start !== null && range.end !== null && activePresetOf(range) === null
      ? {
          end: DateTime.toDate(fromLocalDatetimeString(`${range.end}T23:59`)),
          start: DateTime.toDate(fromLocalDatetimeString(`${range.start}T00:00`)),
        }
      : null

  return h.div(
    [h.Class('grid gap-5')],
    [
      viewGoalCard(model, bundle.goal, unit),
      viewCard(
        'Weight Statistics',
        weightItems.length === 0
          ? h.div([h.Class('text-muted-foreground')], ['No weight data available'])
          : viewStatGrid(weightItems, 'sm:grid-cols-3 lg:grid-cols-5')
      ),
      viewCard(
        'Weight Trend',
        weightData.length > 0
          ? viewWeightTrend({
              displayWeight: show,
              injectionData,
              schedulePeriods,
              state: model.chart,
              trendLine: bundle.weightTrend.trendLine,
              unitLabel: unit,
              weightData,
              zoomRange,
            })
          : h.div([h.Class('text-muted-foreground h-[200px]')], ['No weight data available'])
      ),
      viewCard(
        'Injection Frequency',
        frequencyItems.length === 0
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
      viewCard('Dosage History', viewDosageHistory(bundle.dosageHistory)),
    ]
  )
}

export const viewStats = (model: StatsModel, unit: WeightUnit, range: StatsRange) =>
  h.div(
    [],
    [
      h.div([h.Class('mb-6')], [viewRangeSelector(model, range)]),
      AsyncData.match(model.data, {
        onFailure: () =>
          h.div([h.Class('text-center py-12 text-destructive')], ["We couldn't load the data. Please try again."]),
        onIdle: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onLoading: () => h.div([h.Class('text-center py-12 text-muted-foreground')], ['Loading...']),
        onRefreshing: (bundle) => viewBundle(model, bundle, unit, range),
        onStale: ({ data }) => viewBundle(model, data, unit, range),
        onSuccess: (bundle) => viewBundle(model, bundle, unit, range),
      }),
    ]
  )
