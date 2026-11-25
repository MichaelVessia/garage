import { calendarDateStartUtc } from '@garage/subq-domain/Calendar'
import { nextDose, scheduleView } from '@garage/subq-domain/ScheduleMath'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { journalData, Shell, statsRangeOf, timezoneOf, todayOf } from './model.ts'
import type { Message, Model } from './model.ts'
import { viewInjections } from './page/injections/view.ts'
import { viewScheduleView } from './page/schedule-view.ts'
import { viewSchedule } from './page/schedule/view.ts'
import { viewSettings } from './page/settings/view.ts'
import { calculateStats } from './page/stats/data.ts'
import { viewStats } from './page/stats/view.ts'
import { viewWeight } from './page/weight/view.ts'
import { injectionRouter, scheduleRouter, settingsRouter, statsHref, weightRouter } from './route.ts'
import { button, navLink } from './ui.ts'

type Document = Readonly<{ body: Html; title: string }>

const readFailed = (model: Model) => Arr.some(Record.values(model.readErrors), (failed) => failed)

const makeView = (h: HtmlBuilder<Message>): ((model: Model) => Document) => {
  const loading = h.p([h.Role('status'), h.Class('py-12 text-center text-muted-foreground')], ['Loading journal...'])
  const alert = (message: string) =>
    h.div(
      [
        h.Role('alert'),
        h.Class('mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-600/40 p-3'),
      ],
      [
        h.p([], [message]),
        h.button([h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(Shell.ClickedReload())], ['Reload']),
      ]
    )

  const navItems: ReadonlyArray<readonly [label: string, href: string, tag: string]> = [
    ['Stats', statsHref, 'Stats'],
    ['Weight', weightRouter({}), 'Weight'],
    ['Injections', injectionRouter({}), 'Injection'],
    ['Schedule', scheduleRouter({}), 'Schedule'],
  ]

  const viewShell = (model: Model, content: Html): Html =>
    h.div(
      [h.Class('max-w-7xl mx-auto p-4 sm:p-6')],
      [
        h.header(
          [h.Class('flex flex-col gap-3 mb-6 pb-4 border-b sm:mb-8 sm:pb-5')],
          [
            h.div(
              [h.Class('flex items-center justify-between gap-3')],
              [
                h.h1(
                  [h.Class('flex items-center gap-2 text-lg font-semibold tracking-tight')],
                  [h.img([h.Src('/logo.svg'), h.Alt(''), h.Class('h-6 w-6')]), 'SubQ']
                ),
                h.div(
                  [h.Class('flex items-center gap-3')],
                  [
                    h.a(
                      [h.Href(settingsRouter({}))],
                      [h.button([h.Class(button({ size: 'icon', variant: 'ghost' })), h.Title('Settings')], ['⚙'])]
                    ),
                  ]
                ),
              ]
            ),
            h.nav(
              [h.Class('flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide')],
              Arr.map(navItems, ([label, href, tag]) =>
                h.a([h.Href(href), h.Class(navLink(model.route._tag === tag))], [label])
              )
            ),
          ]
        ),
        h.main(
          [],
          [
            model.sessionExpired
              ? alert('Session expired. Reload to sign in.')
              : readFailed(model)
                ? alert('Cannot load the journal. Reload to try again.')
                : h.empty,
            model.mutationError === null
              ? h.empty
              : h.p([h.Role('alert'), h.Class('mb-4 text-sm text-destructive')], [model.mutationError]),
            h.fieldset(
              [h.Disabled(model.saving || model.sessionExpired || readFailed(model)), h.Class('min-w-0')],
              [content]
            ),
          ]
        ),
      ]
    )

  const viewPage = (model: Model): Html => {
    const data = journalData(model)
    if (Option.isNone(data) || model.profile === null) {
      return model.sessionExpired || readFailed(model) ? h.empty : loading
    }
    const { weights, injections, schedules, goals } = data.value
    const { latestWeight, knownSites } = model.profile
    const timezone = timezoneOf(model)
    const today = todayOf(model)
    const unit = data.value.preferences.weightUnit ?? 'lbs'
    const selected = statsRangeOf(model)

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
      NotFound: () => h.div([h.Class('text-muted-foreground')], ['Page not found']),
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
      ScheduleView: ({ scheduleId }) =>
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
      Stats: () =>
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
      Weight: () => viewWeight({ h, model: { ...model.weight, logs: weights }, timezone, unit }),
    })
  }

  return (model: Model): Document => ({ body: viewShell(model, viewPage(model)), title: 'SubQ' })
}

export const view: {
  (h: HtmlBuilder<Message>): (model: Model) => Document
  (model: Model, h: HtmlBuilder<Message>): Document
} = Function.dual(2, (model: Model, h: HtmlBuilder<Message>): Document => makeView(h)(model))
