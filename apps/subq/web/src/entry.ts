import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { Runtime } from 'foldkit'

import { ApiLive, FetchWithCredentials } from './api.js'
import { MissingRoot } from './errors.js'
import { init, update } from './main.js'
import { ChangedUrl, ClickedLink, Flags, Model } from './model.js'
import { view } from './view.js'

const container = document.querySelector<HTMLElement>('#root')

if (container === null) {
  throw MissingRoot.make({})
}

const application = Runtime.makeApplication({
  Flags,
  Model,
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

Runtime.run(application, {
  flags: Effect.sync(() => ({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Flags)),
    Effect.orDie
  ),
})
