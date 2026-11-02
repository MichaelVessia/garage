import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'

import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateStartUtc,
  CalendarDate,
  GoalId,
  IanaTimezone,
  InjectionLogListParams,
  Limit,
  Notes,
  Offset,
  StatsParams,
  UserGoalCreate,
  UserGoalDelete,
  UserGoalUpdate,
  Weight,
} from '#shared'

import { Api } from '../../api.js'
import { utcToLocalDateString } from '../../lib/datetime.js'
import { statsRouter } from '../../route.js'
import {
  CompletedOpenGoalForm,
  FailedFetchStats,
  FailedSaveGoal,
  FetchStatsResult,
  NavigatedStats,
  RejectedFetchStats,
  StatsPreset,
  SucceededDeleteGoal,
  SucceededFetchStats,
  SucceededSaveGoal,
  distinctStatsResultTimezones,
  rangeKey,
} from './model.js'
import type { StatsBundle, StatsRange } from './model.js'

// ============================================
// Commands
// ============================================

const toStatsParams = (range: StatsRange): StatsParams =>
  StatsParams.make({
    endDate: Option.getOrUndefined(range.end),
    startDate: Option.getOrUndefined(range.start),
  })

export const FetchStats = Command.define('FetchStats', {
  args: {
    start: Schema.NullOr(CalendarDate),
    end: Schema.NullOr(CalendarDate),
    requestGeneration: Schema.Int,
    timezone: IanaTimezone,
  },
  messages: [FetchStatsResult, FailedFetchStats],
  execute: ({ end, requestGeneration, start, timezone }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const range: StatsRange = { end: Option.fromNullishOr(end), start: Option.fromNullishOr(start) }
      const params = toStatsParams(range)

      const listParams = InjectionLogListParams.make({
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
    ),
})

const presetStartDate = (end: CalendarDate, preset: StatsPreset): CalendarDate => {
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
export const ApplyPreset = Command.define('ApplyPreset', {
  args: { preset: StatsPreset, timezone: IanaTimezone },
  messages: [NavigatedStats],
  execute: ({ preset, timezone }) =>
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
    }),
})

export const NavigateStatsRange = Command.define('NavigateStatsRange', {
  args: { start: CalendarDate, end: CalendarDate },
  messages: [NavigatedStats],
  execute: ({ end, start }) =>
    pushUrl(statsRouter({ end: Option.some(end), start: Option.some(start) })).pipe(Effect.as(NavigatedStats())),
})

export const OpenGoalForm = Command.define('OpenGoalForm', {
  args: { timezone: IanaTimezone },
  messages: [CompletedOpenGoalForm],
  execute: ({ timezone }) =>
    DateTime.now.pipe(Effect.map((now) => CompletedOpenGoalForm({ todayLocal: utcToLocalDateString(now, timezone) }))),
})

export const SaveGoal = Command.define('SaveGoal', {
  args: {
    editingId: Schema.NullOr(GoalId),
    goalWeightLbs: Schema.Finite,
    startDate: Schema.NullOr(CalendarDate),
    targetDate: Schema.NullOr(CalendarDate),
    notes: Schema.String,
  },
  messages: [SucceededSaveGoal, FailedSaveGoal],
  execute: ({ editingId, goalWeightLbs, notes, startDate, targetDate }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* editingId === null
        ? api.GoalCreate(
            UserGoalCreate.make({
              goalWeight: Weight.make(goalWeightLbs),
              notes: notes === '' ? Option.none() : Option.some(Notes.make(notes)),
              startingDate: Option.fromNullOr(startDate),
              targetDate: Option.fromNullOr(targetDate),
            })
          )
        : api.GoalUpdate(
            UserGoalUpdate.make({
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
    ),
})

export const DeleteGoal = Command.define('DeleteGoal', {
  args: { goalId: GoalId },
  messages: [SucceededDeleteGoal, FailedSaveGoal],
  execute: ({ goalId }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.GoalDelete(UserGoalDelete.make({ id: goalId }))

      return SucceededDeleteGoal()
    }).pipe(
      Effect.tapError((cause) => Effect.logDebug('DeleteGoal failed', { error: cause })),
      Effect.orElseSucceed(() => FailedSaveGoal({ message: 'Failed to delete goal' }))
    ),
})
