import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { FetchHttpClient } from 'effect/http'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { Runtime } from 'foldkit'

import { ApiLive } from './api.js'
import { MissingRoot } from './errors.js'
import { Flags, Model, init, subscriptions, update } from './main.js'
import { view } from './view.js'

import '@fontsource-variable/figtree/wght.css'
import './index.css'

const container = document.querySelector<HTMLElement>('#root')
if (container === null) {
  throw new MissingRoot()
}

const application = Runtime.makeElement({
  Flags,
  Model,
  flags: DateTime.now.pipe(
    Effect.map((now) => ({
      now,
      // The server stamps the page it serves with its version; absent under the Vite dev server.
      bootVersion: Option.fromNullishOr(document.querySelector('meta[name="frame-version"]')?.getAttribute('content')),
    }))
  ),
  init,
  update,
  view,
  subscriptions,
  container,
  resources: Layer.merge(ApiLive, FetchHttpClient.layer),
})

Runtime.run(application)
