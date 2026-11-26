import type { Html } from '@effect/ui/html'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

import { assetsView } from './AssetsView.ts'
import { dueView } from './DueView.ts'
import { forms, secondaryButton } from './Forms.ts'
import { Screen } from './Model.ts'
import type { Message, Model } from './Model.ts'
import { screenOf, screenPaths } from './Route.ts'
import { appLink } from './WebLink.ts'

export const view = (h: Html.H<Message>) => (model: Model) => {
  const currentScreen = screenOf(model.route)
  return h.div.class('min-h-screen bg-stone-50 text-stone-900').children(
    h.header.class('border-b border-stone-200 bg-white').children(
      h.div.class('mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6').children(
        h.h1.class('text-xl font-bold tracking-tight text-teal-950').children('Logbook'),
        h.nav
          .attr('aria-label', 'Logbook screens')
          .class('flex flex-wrap gap-2')
          .children(
            Arr.map(Screen.literals, (screen) =>
              appLink(h)(model, screenPaths[screen])
                .class(
                  `${secondaryButton} aria-current:bg-teal-50 aria-current:border-teal-700 aria-disabled:opacity-50`
                )
                .attr('aria-current', screen === currentScreen ? 'page' : 'false')
                .children(screen)
            )
          )
      )
    ),
    h.main.class('mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6').children(
      model.sessionExpired
        ? h.p
            .attr('role', 'alert')
            .class('rounded-lg bg-amber-100 px-4 py-3 text-amber-950')
            .children('Session expired. Reload to sign in.')
        : undefined,
      !model.sessionExpired && model.readFailures.catalog
        ? h.p.attr('role', 'alert').class('text-red-800').children('Cannot load the home catalog. Reload to try again.')
        : undefined,
      !model.sessionExpired && currentScreen === 'Assets' && (model.readFailures.detail || model.readFailures.activity)
        ? h.p
            .attr('role', 'alert')
            .class('text-red-800')
            .children('Cannot load all asset records. Reload to try again.')
        : undefined,
      !model.sessionExpired && !model.readFailures.catalog && model.catalog === null
        ? h.p.attr('role', 'status').class('text-sm text-stone-600').children('Loading the home catalog…')
        : undefined,
      model.notice === null
        ? undefined
        : h.p.attr('role', 'status').class('text-sm font-medium text-teal-800').children(model.notice),
      Match.value(currentScreen).pipe(
        Match.when('Due', () => dueView(h)(model)),
        Match.when('Assets', () => assetsView(h)(model)),
        Match.when('Quick Log', () => forms(h)(model).quick()),
        Match.exhaustive
      )
    )
  )
}
