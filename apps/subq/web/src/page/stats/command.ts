import { addCalendarMonths, CalendarDate, IanaTimezone } from '@garage/subq-domain/Calendar'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'

import { utcToLocalDateString } from '../../lib/datetime.ts'
import { statsRouter } from '../../route.ts'
import { CompletedOpenGoalForm, NavigatedStats, StatsPreset } from './model.ts'

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
