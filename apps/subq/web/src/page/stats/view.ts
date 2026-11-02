import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { addCalendarDays, calendarDateStartUtc } from '#shared'
import type { IanaTimezone, InjectionSchedule, WeightUnit } from '#shared'

import type { InjectionPoint, SchedulePeriod, WeightPoint } from '../../chart/layout.js'
import { viewWeightTrend } from '../../chart/weight-trend.js'
import { displayWeight, formatWeight } from '../../data/settings.js'
import { button, card, input } from '../../ui.js'
import { viewBarChart, viewDoseHistory, viewPieChart } from './chart-view.js'
import { viewGoalCardContent } from './goal-view.js'
import { ChangedCustomEnd, ChangedCustomStart, ClickedStatsPreset, CommittedCustomRange } from './model.js'
import type { StatsBundle, StatsMessage, StatsModel, StatsPreset, StatsRange } from './model.js'

// ============================================
// Views
// ============================================

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

export const scheduleEndDate: {
  (timezone: IanaTimezone): (schedule: InjectionSchedule) => Option.Option<Date>
  (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date>
} = Function.dual(2, (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date> =>
  Option.map(finiteScheduleDays(schedule), (totalDays) =>
    calendarDateStartUtc(addCalendarDays(schedule.startDate, totalDays - 1), timezone).pipe(DateTime.toDate)
  )
)

export const scheduleEndExclusiveDate: {
  (timezone: IanaTimezone): (schedule: InjectionSchedule) => Option.Option<Date>
  (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date>
} = Function.dual(2, (schedule: InjectionSchedule, timezone: IanaTimezone): Option.Option<Date> =>
  Option.map(finiteScheduleDays(schedule), (totalDays) =>
    calendarDateStartUtc(addCalendarDays(schedule.startDate, totalDays), timezone).pipe(DateTime.toDate)
  )
)

const activePresetOf = (range: StatsRange): Option.Option<StatsPreset> =>
  Option.isNone(range.start) && Option.isNone(range.end) ? Option.some('all') : Option.none()

const PRESETS: ReadonlyArray<readonly [StatsPreset, string]> = [
  ['1m', '1 Month'],
  ['3m', '3 Months'],
  ['6m', '6 Months'],
  ['1y', '1 Year'],
  ['all', 'All Time'],
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const makeViewStats = <ParentMessage>(h: HtmlBuilder<ParentMessage | StatsMessage>) => {
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
      Arr.map(items, ([label, value]) =>
        h.div(
          [],
          [
            h.div([h.Class('text-xs text-muted-foreground')], [label]),
            h.div([h.Class('text-lg font-semibold font-mono')], [value]),
          ]
        )
      )
    )

  const viewRangeSelector = (model: StatsModel, range: StatsRange) => {
    const active = activePresetOf(range)

    return h.div(
      [h.Class('flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4')],
      [
        h.div(
          [h.Class('flex gap-2 flex-wrap')],
          Arr.map(PRESETS, ([key, label]) =>
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
                  [
                    h.Class(button({ size: 'sm', variant: 'outline' })),
                    h.OnClick(ClickedStatsPreset({ preset: 'all' })),
                  ],
                  ['Reset']
                ),
              ]
            )
          : h.empty,
      ]
    )
  }

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

    const weightData: ReadonlyArray<WeightPoint> = Arr.map(bundle.weightTrend.points, (point) => ({
      date: point.date,
      notes: Option.none(),
      weight: point.weight,
    }))

    const injectionData: ReadonlyArray<InjectionPoint> = Arr.map(bundle.injections, (injection) => ({
      date: DateTime.toDate(injection.datetime),
      doseMg: injection.doseMg,
      drug: injection.drug,
    }))

    const schedulePeriods: ReadonlyArray<SchedulePeriod> = Arr.map(bundle.schedules, (schedule) => ({
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
        viewCard('Goal Progress', viewGoalCardContent({ goal: Option.fromNullishOr(bundle.goal), h, model, unit })),
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
                h,
                props: {
                  displayWeight: show,
                  injectionData,
                  schedulePeriods,
                  state: model.chart,
                  timezone,
                  trendLine: Option.fromNullishOr(bundle.weightTrend.trendLine),
                  unitLabel: unit,
                  weightData,
                  zoomRange,
                },
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
            viewCard(
              'Injection Sites',
              viewPieChart({ data: Arr.map(bundle.siteStats.sites, (site) => [site.site, site.count]), h })
            ),
            viewCard(
              'Injections by Day of Week',
              viewPieChart({
                data: Arr.map(bundle.dayOfWeek.days, (day) => [DAY_NAMES[day.dayOfWeek] ?? 'Unknown', day.count]),
                h,
              })
            ),
            viewCard(
              'Medications Used',
              viewBarChart({ data: Arr.map(bundle.drugBreakdown.drugs, (drug) => [drug.drug, drug.count]), h })
            ),
          ]
        ),
        viewCard('Dose History', viewDoseHistory({ data: bundle.doseHistory, h, timezone })),
      ]
    )
  }

  return (model: StatsModel, unit: WeightUnit, range: StatsRange, timezone: IanaTimezone): Html =>
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
}

export const viewStats = <ParentMessage>({
  model,
  unit,
  range,
  timezone,
  h,
}: {
  readonly model: StatsModel
  readonly unit: WeightUnit
  readonly range: StatsRange
  readonly timezone: IanaTimezone
  readonly h: HtmlBuilder<ParentMessage | StatsMessage>
}): Html => makeViewStats(h)(model, unit, range, timezone)
