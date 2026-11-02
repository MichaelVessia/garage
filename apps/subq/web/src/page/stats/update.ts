import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { AsyncData } from 'foldkit'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { CalendarDate } from '#shared'
import type { IanaTimezone } from '#shared'

import type { Api } from '../../api.js'
import { ChartMessage, updateChart } from '../../chart/state.js'
import { FetchSettings } from '../../data/settings.js'
import type { FailedFetchSettings, SucceededFetchSettings } from '../../data/settings.js'
import { dateToCalendarDate, epochToDate } from '../../lib/datetime.js'
import { ApplyPreset, DeleteGoal, FetchStats, NavigateStatsRange, OpenGoalForm, SaveGoal } from './command.js'
import { rangeKey } from './model.js'
import type { NavigatedStats, StatsMessage, StatsModel, StatsRange } from './model.js'

// ============================================
// Update
// ============================================

type StatsCommandMessage =
  | StatsMessage
  | typeof NavigatedStats.Type
  | typeof SucceededFetchSettings.Type
  | typeof FailedFetchSettings.Type

type UpdateReturn = Update.Return<StatsModel, StatsCommandMessage, Api>

const fetchStatsCommand = (range: StatsRange, timezone: IanaTimezone, requestGeneration: number) =>
  FetchStats({
    end: Option.getOrNull(range.end),
    requestGeneration,
    start: Option.getOrNull(range.start),
    timezone,
  })

const startStatsFetch = (model: StatsModel, range: StatsRange, timezone: IanaTimezone): UpdateReturn => {
  const requestGeneration = model.requestGeneration + 1

  return {
    model: modifyFields(model, {
      customEnd: () => Option.getOrElse(range.end, () => ''),
      customStart: () => Option.getOrElse(range.start, () => ''),
      data: () => AsyncData.Loading(),
      fetchedRange: () => rangeKey(range),
      fetchedTimezone: () => timezone,
      requestGeneration: () => requestGeneration,
    }),
    commands: [fetchStatsCommand(range, timezone, requestGeneration)],
  }
}

// Called by the app root when the stats route is entered or its range changes.
export const syncStatsFetch: {
  (range: StatsRange, timezone: IanaTimezone): (model: StatsModel) => UpdateReturn
  (model: StatsModel, range: StatsRange, timezone: IanaTimezone): UpdateReturn
} = Function.dual(3, (model: StatsModel, range: StatsRange, timezone: IanaTimezone): UpdateReturn => {
  const key = rangeKey(range)

  return model.fetchedRange === key && model.fetchedTimezone === timezone && !AsyncData.isIdle(model.data)
    ? { model }
    : startStatsFetch(model, range, timezone)
})

const splitRangeKey = (key: string): StatsRange => {
  const [start, end] = Str.split(key, '|')

  return {
    end: end === undefined || end === '' ? Option.none() : Option.some(CalendarDate.make(end)),
    start: start === '' ? Option.none() : Option.some(CalendarDate.make(start)),
  }
}

const isChartMessage = Schema.is(ChartMessage)

const decodeCalendarDate = Schema.decodeOption(CalendarDate)

const parseOptionalCalendarDate = (value: string): Option.Option<Option.Option<CalendarDate>> =>
  value === '' ? Option.some(Option.none()) : decodeCalendarDate(value).pipe(Option.map(Option.some))

const prepareStatsTimezoneReconciliation = (model: StatsModel): StatsModel =>
  modifyFields(model, {
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

const submitGoalForm = (model: StatsModel, unit: 'lbs' | 'kg'): UpdateReturn => {
  if (model.goalForm === null) {
    return { model }
  }

  const parsed = Number(model.goalForm.goalWeight)

  if (Number.isNaN(parsed) || parsed <= 0) {
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

  const lbs = unit === 'kg' ? parsed * 2.2046226 : parsed

  return {
    model: modifyFields(model, {
      goalForm: (form) => (form === null ? null : modifyFields(form, { error: () => null, submitting: () => true })),
    }),
    commands: [
      SaveGoal({
        editingId: model.goalForm.editingId,
        goalWeightLbs: lbs,
        notes: model.goalForm.notes,
        startDate: Option.getOrNull(startDate.value),
        targetDate: Option.getOrNull(targetDate.value),
      }),
    ],
  }
}

const editGoal = (model: StatsModel): UpdateReturn => {
  const bundle = AsyncData.getData(model.data)
  const goal = Option.isSome(bundle) ? bundle.value.goal : null

  if (goal === null) {
    return { model }
  }

  return {
    model: modifyFields(model, {
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
  }
}

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

const updateStatsPage = (
  model: StatsModel,
  message: StatsMessage,
  timezone: IanaTimezone,
  settingsRequestGeneration: number
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
      ClickedEditGoal: () => editGoal(model),
      ClickedSetGoal: () => ({ model, commands: [OpenGoalForm({ timezone })] }),
      ClickedStatsPreset: ({ preset }) => ({ model, commands: [ApplyPreset({ preset, timezone })] }),
      CommittedCustomRange: () => commitCustomRange(model),
      ConfirmedDeleteGoal: ({ goalId }) => ({
        model: modifyFields(model, { goalDeleteConfirm: () => false }),
        commands: [DeleteGoal({ goalId })],
      }),
      FailedFetchStats: ({ key, message: error, requestedTimezone, requestGeneration }) =>
        isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)
          ? { model: modifyFields(model, { data: () => AsyncData.Failure({ error }) }) }
          : { model },
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
            notes: '',
            startDate: todayLocal,
            submitting: false,
            targetDate: '',
          }),
        }),
      }),
      RejectedFetchStats: ({ key, requestedTimezone, requestGeneration }) =>
        isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)
          ? {
              model: prepareStatsTimezoneReconciliation(model),
              commands: [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
            }
          : { model },
      RequestedDeleteGoal: () => ({ model: modifyFields(model, { goalDeleteConfirm: () => true }) }),
      SubmittedGoalForm: ({ unit }) => submitGoalForm(model, unit),
      SucceededDeleteGoal: () =>
        model.fetchedRange === null ? { model } : startStatsFetch(model, splitRangeKey(model.fetchedRange), timezone),
      SucceededFetchStats: ({ bundle, key, requestedTimezone, requestGeneration, timezone: responseTimezone }) => {
        if (!isCurrentStatsResponse(model, key, requestedTimezone, requestGeneration, timezone)) {
          return { model }
        }

        return responseTimezone === timezone
          ? { model: modifyFields(model, { data: () => AsyncData.succeed(bundle), fetchedRange: () => key }) }
          : {
              model: prepareStatsTimezoneReconciliation(model),
              commands: [FetchSettings({ detectedTimezone: timezone, requestGeneration: settingsRequestGeneration })],
            }
      },
      SucceededSaveGoal: () => {
        const next = modifyFields(model, { goalForm: () => null })

        return model.fetchedRange === null
          ? { model: next }
          : startStatsFetch(next, splitRangeKey(model.fetchedRange), timezone)
      },
    })
  )
}

export const updateStats: {
  (
    message: StatsMessage,
    timezone: IanaTimezone,
    settingsRequestGeneration: number
  ): (model: StatsModel) => UpdateReturn
  (model: StatsModel, message: StatsMessage, timezone: IanaTimezone, settingsRequestGeneration: number): UpdateReturn
} = Function.dual(4, updateStatsPage)
