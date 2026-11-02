import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { timezoneOf, weightUnitOf } from './data/settings.js'
import { ClickedRetrySettings, ClickedSignOut, statsRangeOf } from './model.js'
import type { Message, Model } from './model.js'
import { viewInjections } from './page/injections/view.js'
import { viewLogin } from './page/login.js'
import { viewScheduleView } from './page/schedule-view.js'
import { viewSchedule } from './page/schedule/view.js'
import { viewSettings } from './page/settings/view.js'
import { viewStats } from './page/stats/view.js'
import { viewWeight } from './page/weight/view.js'
import { injectionRouter, scheduleRouter, settingsRouter, statsHref, weightRouter } from './route.js'
import { button, navLink } from './ui.js'

type Document = Readonly<{ body: Html; title: string }>

// ============================================
// View
// ============================================

const makeView = (h: HtmlBuilder<Message>): ((model: Model) => Document) => {
  const viewLoading = h.div(
    [h.Class('flex items-center justify-center h-screen')],
    [h.p([h.Class('text-muted-foreground')], ['Loading...'])]
  )

  const navItems: ReadonlyArray<readonly [label: string, href: string, tag: string]> = [
    ['Stats', statsHref, 'Stats'],
    ['Weight', weightRouter({}), 'Weight'],
    ['Injections', injectionRouter({}), 'Injection'],
    ['Schedule', scheduleRouter({}), 'Schedule'],
  ]

  const viewShell = (model: Model, email: string, content: Html): Html =>
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
                    h.span([h.Class('hidden sm:inline text-xs text-muted-foreground')], [email]),
                    h.a(
                      [h.Href(settingsRouter({}))],
                      [h.button([h.Class(button({ size: 'icon', variant: 'ghost' })), h.Title('Settings')], ['⚙'])]
                    ),
                    h.button(
                      [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(ClickedSignOut())],
                      ['Sign Out']
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
        h.main([], [content]),
      ]
    )

  const viewPlaceholder = (title: string): Html => h.div([h.Class('text-muted-foreground')], [`${title} — coming soon`])

  const viewSettingsFailure = (error: string): Html =>
    h.div(
      [h.Class('mx-auto max-w-2xl rounded-md border border-destructive/40 p-6')],
      [
        h.h2([h.Class('text-lg font-semibold text-destructive')], ['Timezone setup needs attention']),
        h.p([h.Class('mt-3 break-words text-sm')], [error]),
        h.p(
          [h.Class('mt-3 text-sm text-muted-foreground')],
          [
            'Some earlier records may already have been converted. Correct the identified problem and retry; migration retries are idempotent and completed conversions are not applied again.',
          ]
        ),
        h.button([h.Class(button({ class: 'mt-4' })), h.OnClick(ClickedRetrySettings())], ['Retry timezone setup']),
      ]
    )

  const viewPage = (model: Model): Html => {
    const timezone = timezoneOf(model.settings, model.detectedTimezone)

    return Match.value(model.route).pipe(
      Match.tagsExhaustive({
        Injection: () => viewInjections({ h, model: model.injections, timezone }),
        Login: () => viewPlaceholder('Login'),
        NotFound: () => h.div([h.Class('text-muted-foreground')], ['Page not found']),
        Schedule: () => viewSchedule({ h, model: model.schedule }),
        ScheduleView: () => viewScheduleView({ h, model: model.scheduleView, timezone }),
        Settings: () => viewSettings({ h, model: model.settingsPage, settings: model.settings, timezone }),
        Stats: () =>
          viewStats({
            h,
            model: model.stats,
            range: statsRangeOf(model),
            timezone,
            unit: weightUnitOf(model.settings),
          }),
        Weight: () => viewWeight({ h, model: model.weight, timezone, unit: weightUnitOf(model.settings) }),
      })
    )
  }

  return (model: Model): Document => {
    if (!model.sessionLoaded) {
      return { body: viewLoading, title: 'SubQ' }
    }

    if (model.user === null || model.route._tag === 'Login') {
      return { body: viewLogin({ h, model: model.login }), title: 'SubQ — Sign In' }
    }

    const settingsError = AsyncData.getError(model.settings)

    const page = Option.match(settingsError, {
      onNone: () => viewPage(model),
      onSome: viewSettingsFailure,
    })

    return { body: viewShell(model, model.user.email, page), title: 'SubQ' }
  }
}

export const view: {
  (h: HtmlBuilder<Message>): (model: Model) => Document
  (model: Model, h: HtmlBuilder<Message>): Document
} = Function.dual(2, (model: Model, h: HtmlBuilder<Message>): Document => makeView(h)(model))
