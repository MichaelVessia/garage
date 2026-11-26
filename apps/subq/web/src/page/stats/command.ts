import { Command, Router } from '@effect/ui'
import { addCalendarMonths, IanaTimezone } from '@garage/subq-domain/Calendar'
import type { CalendarDate } from '@garage/subq-domain/Calendar'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { utcToLocalDateString } from '../../lib/datetime.ts'
import { AppRoute } from '../../route.ts'
import { CompletedOpenGoalForm, StatsPreset } from './model.ts'

const presetMonths = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 } as const

export class ApplyPreset extends Command.Service<ApplyPreset>()('ApplyPreset', {
  args: { preset: StatsPreset, timezone: IanaTimezone },
  success: Schema.Void,
}) {
  static readonly layer = this.toLayer(
    Effect.map(
      Router.Router,
      (router) =>
        ({ preset, timezone }) =>
          Effect.gen(function* () {
            if (preset === 'all') {
              yield* router.push(AppRoute.Stats())
            } else {
              const now = yield* DateTime.now
              const end = utcToLocalDateString(now, timezone)
              const start = addCalendarMonths(end, -presetMonths[preset])
              yield* router.push(AppRoute.Stats({ search: { start, end } }))
            }
          })
    )
  )
}

export const navigateStatsRange = (search: { readonly start: CalendarDate; readonly end: CalendarDate }) =>
  Router.push(AppRoute, AppRoute.Stats({ search })).pipe(Command.asNoop)

export const OpenGoalForm = Command.make('OpenGoalForm', { args: { timezone: IanaTimezone } }, ({ timezone }) =>
  DateTime.now.pipe(Effect.map((now) => CompletedOpenGoalForm({ todayLocal: utcToLocalDateString(now, timezone) })))
)
