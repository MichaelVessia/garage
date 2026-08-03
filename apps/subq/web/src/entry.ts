import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { Runtime } from 'foldkit'

import { ApiLive, FetchWithCredentials } from './api.js'
import { MissingRoot } from './errors.js'
import { ChangedUrl, ClickedLink, Flags, Model, init, update, view } from './main.js'

import './index.css'

const container = document.querySelector<HTMLElement>('#root')
if (container === null) {
  throw new MissingRoot()
}

const application = Runtime.makeApplication({
  Flags,
  Model,
  flags: Effect.sync(() => ({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Flags)),
    Effect.orDie
  ),
  init,
  update,
  view,
  container,
  resources: Layer.mergeAll(ApiLive, FetchWithCredentials),
  routing: {
    onUrlChange: (url) => ChangedUrl({ url }),
    onUrlRequest: (request) => ClickedLink({ request }),
  },
})

Runtime.run(application)
