import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import type { Document, HtmlBuilder } from 'foldkit/html'

import { assetsView } from './AssetsView.ts'
import { dueView } from './DueView.ts'
import { forms, secondaryButton } from './Forms.ts'
import { Message, Screen } from './Model.ts'
import type { Model } from './Model.ts'

// @effect-diagnostics-next-line missingPipeableSignature:off -- Foldkit calls view with the model and builder.
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Logbook',
  body: h.div(
    [h.Class('min-h-screen bg-stone-50 text-stone-900')],
    [
      h.header(
        [h.Class('border-b border-stone-200 bg-white')],
        [
          h.div(
            [h.Class('mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6')],
            [
              h.h1([h.Class('text-xl font-bold tracking-tight text-teal-950')], ['Logbook']),
              h.nav(
                [h.AriaLabel('Logbook screens'), h.Class('flex flex-wrap gap-2')],
                Arr.map(Screen.literals, (screen) =>
                  h.button(
                    [
                      h.Type('button'),
                      h.Class(`${secondaryButton} aria-current:bg-teal-50 aria-current:border-teal-700`),
                      h.AriaCurrent(screen === model.screen ? 'page' : 'false'),
                      h.Disabled(model.attempt !== null),
                      h.OnClick(Message.ChoseScreen({ screen })),
                    ],
                    [screen]
                  )
                )
              ),
            ]
          ),
        ]
      ),
      h.main(
        [h.Class('mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6')],
        [
          model.sessionExpired
            ? h.p(
                [h.Role('alert'), h.Class('rounded-lg bg-amber-100 px-4 py-3 text-amber-950')],
                ['Session expired. Reload to sign in.']
              )
            : null,
          !model.sessionExpired && model.readFailures.catalog
            ? h.p([h.Role('alert'), h.Class('text-red-800')], ['Cannot load the home catalog. Reload to try again.'])
            : null,
          !model.sessionExpired &&
          model.screen === 'Assets' &&
          (model.readFailures.detail || model.readFailures.activity)
            ? h.p([h.Role('alert'), h.Class('text-red-800')], ['Cannot load all asset records. Reload to try again.'])
            : null,
          !model.sessionExpired && !model.readFailures.catalog && model.catalog === null
            ? h.p([h.Role('status'), h.Class('text-sm text-stone-600')], ['Loading the home catalog…'])
            : null,
          model.notice === null
            ? null
            : h.p([h.Role('status'), h.Class('text-sm font-medium text-teal-800')], [model.notice]),
          Match.value(model.screen).pipe(
            Match.when('Due', () => dueView(h)(model)),
            Match.when('Assets', () => assetsView(h)(model)),
            Match.when('Quick Log', () => forms(h)(model).quick()),
            Match.exhaustive
          ),
        ]
      ),
    ]
  ),
})
