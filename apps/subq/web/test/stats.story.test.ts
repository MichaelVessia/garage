// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as AsyncData from 'foldkit/asyncData'

import {
  CalendarDate,
  DoseHistoryStats,
  DrugBreakdownStats,
  GoalId,
  IanaTimezone,
  InjectionDayOfWeekStats,
  InjectionSchedule,
  InjectionSiteStats,
  WeightTrendStats,
} from '#shared'

import { initialChartState, viewWeightTrend } from '../src/chart/weight-trend.js'
import {
  ChangedCustomEnd,
  ChangedCustomStart,
  CommittedCustomRange,
  FailedFetchStats,
  RejectedFetchStats,
  SucceededDeleteGoal,
  SucceededFetchStats,
  SucceededSaveGoal,
  SubmittedGoalForm,
  distinctStatsResultTimezones,
  initialStatsModel,
  rangeKey,
  scheduleEndDate,
  scheduleEndExclusiveDate,
  syncStatsFetch,
  updateStats as updateStatsPage,
} from '../src/page/stats.js'
import type { StatsModel } from '../src/page/stats.js'

const timezone = IanaTimezone.make('America/New_York')
const range = {
  end: Option.some(CalendarDate.make('2026-07-03')),
  start: Option.some(CalendarDate.make('2026-06-03')),
}

const updateStats = (
  model: StatsModel,
  message: Parameters<typeof updateStatsPage>[1],
  currentTimezone: IanaTimezone
) => updateStatsPage(model, message, currentTimezone, 1)

const emptyBundle = {
  dayOfWeek: Schema.decodeUnknownSync(InjectionDayOfWeekStats)({ days: [], totalInjections: 0 }),
  doseHistory: Schema.decodeUnknownSync(DoseHistoryStats)({ points: [] }),
  drugBreakdown: Schema.decodeUnknownSync(DrugBreakdownStats)({ drugs: [], totalInjections: 0 }),
  frequency: null,
  goal: null,
  injections: [],
  schedules: [],
  siteStats: Schema.decodeUnknownSync(InjectionSiteStats)({ sites: [], totalInjections: 0 }),
  weightStats: null,
  weightTrend: Schema.decodeUnknownSync(WeightTrendStats)({ points: [], trendLine: null }),
}

describe('stats page update', () => {
  it('renders a finite schedule band through the whole final local day', () => {
    const start = DateTime.makeUnsafe('2026-01-01T05:00:00.000Z').pipe(DateTime.toDate)
    const inclusiveEnd = DateTime.makeUnsafe('2026-01-21T05:00:00.000Z').pipe(DateTime.toDate)
    const nextDayStart = DateTime.makeUnsafe('2026-01-22T05:00:00.000Z').pipe(DateTime.toDate)
    const rendered = JSON.stringify(
      viewWeightTrend({
        displayWeight: (weight) => weight,
        injectionData: [],
        schedulePeriods: [
          {
            drug: 'Semaglutide',
            endDateExclusive: Option.some(nextDayStart),
            endDateInclusive: Option.some(inclusiveEnd),
            scheduleName: 'Finite schedule',
            startDate: start,
          },
        ],
        state: initialChartState,
        timezone,
        trendLine: Option.none(),
        unitLabel: 'lbs',
        weightData: [
          { date: start, notes: Option.none(), weight: 200 },
          { date: nextDayStart, notes: Option.none(), weight: 190 },
        ],
        zoomRange: Option.none(),
      })
    )

    expect(rendered).toContain('Jan 1, 2026 — Jan 21, 2026')
    expect(rendered).toContain('"width":"710"')
  })

  it('uses the last included day as a finite schedule chart end date', () => {
    const audit = DateTime.makeUnsafe('2026-01-01T00:00:00.000Z')
    const schedule = Schema.decodeUnknownSync(InjectionSchedule)({
      createdAt: audit,
      drug: 'Semaglutide',
      frequency: 'weekly',
      id: 'schedule-finite',
      isActive: false,
      name: 'Finite schedule',
      notes: null,
      phases: [
        {
          createdAt: audit,
          doseMg: 1,
          durationDays: 7,
          id: 'phase-1',
          order: 1,
          scheduleId: 'schedule-finite',
          updatedAt: audit,
        },
        {
          createdAt: audit,
          doseMg: 2,
          durationDays: 14,
          id: 'phase-2',
          order: 2,
          scheduleId: 'schedule-finite',
          updatedAt: audit,
        },
      ],
      supplier: null,
      startDate: '2026-01-01',
      updatedAt: audit,
    })

    const end = Option.getOrThrow(scheduleEndDate(schedule, timezone))
    const endExclusive = Option.getOrThrow(scheduleEndExclusiveDate(schedule, timezone))

    expect(end.toISOString()).toBe('2026-01-21T05:00:00.000Z')
    expect(endExclusive.toISOString()).toBe('2026-01-22T05:00:00.000Z')
  })

  it('syncStatsFetch fetches when the range key changes and dedupes otherwise', () => {
    const [loading, commands] = syncStatsFetch(initialStatsModel, range, timezone)
    expect(AsyncData.isLoading(loading.data)).toBe(true)
    expect(loading.fetchedRange).toBe(rangeKey(range))
    expect(loading.fetchedTimezone).toBe(timezone)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.args).toEqual({
      end: '2026-07-03',
      requestGeneration: 1,
      start: '2026-06-03',
      timezone,
    })

    const [same, none] = syncStatsFetch(loading, range, timezone)
    expect(none).toHaveLength(0)
    expect(same).toBe(loading)

    const [, refetch] = syncStatsFetch(loading, { end: Option.none(), start: Option.none() }, timezone)
    expect(refetch).toHaveLength(1)
  })

  it('submits the real edit-form payload with its unchanged starting date and without a starting weight', () => {
    const editing: StatsModel = {
      ...initialStatsModel,
      goalForm: {
        editingId: GoalId.make('goal-ui-payload'),
        error: null,
        goalWeight: '150',
        notes: 'notes-only edit',
        startDate: '2024-01-01',
        submitting: false,
        targetDate: '',
      },
    }

    const [submitting, commands] = updateStats(editing, SubmittedGoalForm({ unit: 'lbs' }), timezone)

    expect(submitting.goalForm?.submitting).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SaveGoal')
    expect(commands[0]?.args).toEqual({
      editingId: 'goal-ui-payload',
      goalWeightLbs: 150,
      notes: 'notes-only edit',
      startDate: '2024-01-01',
      targetDate: null,
    })
  })

  it('custom range only navigates when both dates are set and ordered', () => {
    const base: StatsModel = { ...initialStatsModel }
    const [withStart] = updateStats(base, ChangedCustomStart({ value: '2026-07-01' }), timezone)
    const [, noNav] = updateStats(withStart, CommittedCustomRange(), timezone)
    expect(noNav).toHaveLength(0)

    const [withBoth] = updateStats(withStart, ChangedCustomEnd({ value: '2026-06-01' }), timezone)
    const [, invalid] = updateStats(withBoth, CommittedCustomRange(), timezone)
    expect(invalid).toHaveLength(0)

    const [withValid] = updateStats(withBoth, ChangedCustomEnd({ value: '2026-07-02' }), timezone)
    const [, nav] = updateStats(withValid, CommittedCustomRange(), timezone)
    expect(nav).toHaveLength(1)
  })

  it('rejects an old-zone response while the current timezone request is loading', () => {
    const currentTimezone = IanaTimezone.make('Pacific/Auckland')
    const [loading] = syncStatsFetch(initialStatsModel, range, currentTimezone)

    const [afterStale] = updateStats(
      loading,
      FailedFetchStats({
        key: rangeKey(range),
        message: 'Old timezone request failed',
        requestedTimezone: timezone,
        requestGeneration: 1,
      }),
      currentTimezone
    )

    const [afterStaleSuccess] = updateStats(
      loading,
      SucceededFetchStats({
        bundle: emptyBundle,
        key: rangeKey(range),
        requestedTimezone: timezone,
        requestGeneration: 1,
        timezone,
      }),
      currentTimezone
    )

    expect(AsyncData.isLoading(afterStale.data)).toBe(true)
    expect(AsyncData.isLoading(afterStaleSuccess.data)).toBe(true)
    expect(afterStale.fetchedRange).toBe(rangeKey(range))
    expect(afterStaleSuccess.fetchedRange).toBe(rangeKey(range))
  })

  it('includes goal progress when detecting mixed backend timezones', () => {
    const goalTimezone = IanaTimezone.make('Pacific/Auckland')
    expect(distinctStatsResultTimezones([{ timezone }, { timezone }, { timezone: goalTimezone }])).toEqual([
      timezone,
      goalTimezone,
    ])
  })

  it('rejects a mixed bundle and reconciles authoritative settings instead of retrying the stale zone', () => {
    const [loading] = syncStatsFetch(initialStatsModel, range, timezone)
    const [, commands] = updateStats(
      loading,
      RejectedFetchStats({
        key: rangeKey(range),
        requestedTimezone: timezone,
        requestGeneration: 1,
        timezones: [timezone, IanaTimezone.make('Pacific/Auckland')],
      }),
      timezone
    )

    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('FetchSettings')
    expect(commands[0]?.args).toEqual({ detectedTimezone: timezone, requestGeneration: 1 })
  })

  it('rejects an ABA late response using the monotonic request generation', () => {
    const timezoneB = IanaTimezone.make('Pacific/Auckland')
    const [loadingA1] = syncStatsFetch(initialStatsModel, range, timezone)
    const [loadingB] = syncStatsFetch(loadingA1, range, timezoneB)
    const [loadingA2] = syncStatsFetch(loadingB, range, timezone)

    expect(loadingA2.requestGeneration).toBe(3)

    const [afterLateA] = updateStats(
      loadingA2,
      SucceededFetchStats({
        bundle: emptyBundle,
        key: rangeKey(range),
        requestedTimezone: timezone,
        requestGeneration: 1,
        timezone,
      }),
      timezone
    )
    expect(AsyncData.isLoading(afterLateA.data)).toBe(true)

    const [afterLatestA] = updateStats(
      loadingA2,
      SucceededFetchStats({
        bundle: emptyBundle,
        key: rangeKey(range),
        requestedTimezone: timezone,
        requestGeneration: 3,
        timezone,
      }),
      timezone
    )
    expect(afterLatestA.data._tag).toBe('Success')
  })

  it('preserves timezone when goal changes refetch the current range', () => {
    const [loading] = syncStatsFetch(initialStatsModel, range, timezone)

    const [, saveCommands] = updateStats(loading, SucceededSaveGoal(), timezone)
    const [, deleteCommands] = updateStats(loading, SucceededDeleteGoal(), timezone)

    expect(saveCommands[0]?.args).toEqual({
      end: '2026-07-03',
      requestGeneration: 2,
      start: '2026-06-03',
      timezone,
    })
    expect(deleteCommands[0]?.args).toEqual({
      end: '2026-07-03',
      requestGeneration: 2,
      start: '2026-06-03',
      timezone,
    })
  })
})
