import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import { calendarDateStartUtc } from '@garage/subq-domain/Calendar'
import { nextDose, scheduleView } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'

import { journalData, Shell, statsRangeOf, timezoneOf, todayOf } from './model.ts'
import type { Message, Model } from './model.ts'
import { viewInjections } from './page/injections/view.ts'
import { viewScheduleView } from './page/schedule-view.ts'
import { viewSchedule } from './page/schedule/view.ts'
import { viewSettings } from './page/settings/view.ts'
import { calculateStats } from './page/stats/data.ts'
import { viewStats } from './page/stats/view.ts'
import { viewWeight } from './page/weight/view.ts'
import { AppRoute } from './route.ts'
import { button, navLink } from './ui.ts'

const readFailed = (model: Model) => Arr.some(Record.values(model.readErrors), (failed) => failed)

// @effect-diagnostics-next-line missingPipeableSignature:off -- Effect UI calls the view with the builder and model.
export const view = (h: Html.H<Message>, model: Model): View.Content<Message> => {
  const loading = h.p
    .attr('role', 'status')
    .class('py-12 text-center text-muted-foreground')
    .children('Loading journal...')
  const alert = (message: string) =>
    h.div
      .attr('role', 'alert')
      .class('mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-600/40 p-3')
      .children(
        h.p.children(message),
        h.button
          .class(button({ size: 'sm', variant: 'outline' }))
          .on('click', Shell.ClickedReload())
          .children('Reload')
      )

  const navItems: ReadonlyArray<readonly [label: string, href: string, tag: string]> = [
    ['Stats', AppRoute.print(AppRoute.Stats()), 'Stats'],
    ['Weight', AppRoute.print(AppRoute.Weight()), 'Weight'],
    ['Injections', AppRoute.print(AppRoute.Injection()), 'Injection'],
    ['Schedule', AppRoute.print(AppRoute.Schedule()), 'Schedule'],
  ]

  const range = statsRangeOf(model.route)
  const notFound = () => h.div.class('text-muted-foreground').children('Page not found')

  const viewShell = (content: View.Content<Message> | false) =>
    h.div.class('max-w-7xl mx-auto p-4 sm:p-6').children(
      h.header.class('flex flex-col gap-3 mb-6 pb-4 border-b sm:mb-8 sm:pb-5').children(
        h.div.class('flex items-center justify-between gap-3').children(
          h.h1
            .class('flex items-center gap-2 text-lg font-semibold tracking-tight')
            .children(h.img.attr('src', '/logo.svg').attr('alt', '').class('h-6 w-6'), 'SubQ'),
          h.div.class('flex items-center gap-3').children(
            h.a.attr('href', AppRoute.print(AppRoute.Settings())).children(
              h.button
                .class(button({ size: 'icon', variant: 'ghost' }))
                .attr('title', 'Settings')
                .children('⚙')
            )
          )
        ),
        h.nav.class('flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide').children(
          Arr.map(navItems, ([label, href, tag]) =>
            h.a
              .attr('href', href)
              .class(navLink(tag === 'Stats' ? Option.isSome(range) : model.route._tag === tag))
              .children(label)
          )
        )
      ),
      h.main.children(
        model.sessionExpired
          ? alert('Session expired. Reload to sign in.')
          : readFailed(model)
            ? alert('Cannot load the journal. Reload to try again.')
            : null,
        model.mutationError === null
          ? null
          : h.p.attr('role', 'alert').class('mb-4 text-sm text-destructive').children(model.mutationError),
        h.fieldset
          .disabled(model.saving || model.sessionExpired || readFailed(model))
          .class('min-w-0')
          .children(content)
      )
    )

  const viewPage = (): View.Content<Message> | false => {
    const data = journalData(model)
    if (Option.isNone(data) || model.profile === null) {
      return model.sessionExpired || readFailed(model) ? false : loading
    }
    const { weights, injections, schedules, goals } = data.value
    const { latestWeight, knownSites } = model.profile
    const timezone = timezoneOf(model)
    const today = todayOf(model)
    const unit = data.value.preferences.weightUnit ?? 'lbs'

    const stats = () =>
      Option.match(range, {
        onNone: notFound,
        onSome: (selected) =>
          viewStats({
            h,
            model: {
              ...model.stats,
              data: calculateStats({
                weights,
                injections,
                schedules,
                latestWeight: Option.fromNullOr(latestWeight),
                selected,
                timezone,
                goal: Arr.findFirst(goals, (goal) => goal.isActive),
                now: DateTime.toDate(model.now ?? calendarDateStartUtc(today, timezone)),
              }),
            },
            range: selected,
            timezone,
            unit,
          }),
      })

    return Match.valueTags(model.route, {
      Injection: () =>
        viewInjections({
          h,
          timezone,
          model: {
            ...model.injections,
            logs: injections,
            sites: knownSites,
            schedules,
          },
        }),
      NotFound: notFound,
      Schedule: () =>
        viewSchedule({
          h,
          model: {
            ...model.schedule,
            schedules,
            nextDose: Option.flatMap(
              Arr.findFirst(schedules, (schedule) => schedule.isActive),
              (schedule) => nextDose({ schedule, injections, today, timezone })
            ),
          },
        }),
      ScheduleView: ({ params: { scheduleId } }) =>
        viewScheduleView({
          h,
          timezone,
          model: {
            view: Option.map(
              Arr.findFirst(schedules, ({ id }) => id === scheduleId),
              scheduleView(injections, today, timezone)
            ),
          },
        }),
      Settings: () => viewSettings({ h, model: model.settingsPage, unit, timezone }),
      Stats: stats,
      Index: stats,
      Weight: () => viewWeight({ h, model: { ...model.weight, logs: weights }, timezone, unit }),
    })
  }

  return viewShell(viewPage())
}
