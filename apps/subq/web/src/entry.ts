import * as Domain from '@alchemy.run/domain'
import { layerSecureRandom } from '@effect/platform-browser/BrowserCrypto'
import { IanaTimezone, projectInstantToCalendarDate } from '@garage/subq-domain/Calendar'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Socket from 'effect/socket/Socket'
import { Runtime } from 'foldkit'

import { MissingRoot } from './errors.ts'
import { init, subscriptions, update } from './main.ts'
import { Flags, Model, Shell } from './model.ts'
import { view } from './view.ts'

const container = document.querySelector<HTMLElement>('#root')

if (container === null) {
  throw MissingRoot.make({})
}

const protocol = Domain.protocolWebSocket(`${location.origin}/api`).pipe(
  Layer.provide(Layer.mergeAll(Socket.layerWebSocketConstructorGlobal, FetchHttpClient.layer))
)
const connection = SubqApi.layerClient.pipe(Layer.provide(protocol))

Runtime.run(
  Runtime.makeApplication({
    Flags,
    Model,
    init,
    update,
    view,
    container,
    subscriptions,
    resources: connection,
    routing: {
      onUrlChange: (url) => Shell.ChangedUrl({ url }),
      onUrlRequest: (request) => Shell.ClickedLink({ request }),
    },
  }),
  {
    flags: Effect.gen(function* () {
      const random = yield* SecureRandom.SecureRandom
      const session = yield* random.uuidV4()
      const now = yield* DateTime.now
      const timezone = Schema.decodeOption(IanaTimezone)(Intl.DateTimeFormat().resolvedOptions().timeZone).pipe(
        Option.getOrElse(() => IanaTimezone.make('UTC'))
      )
      return { session, timezone, today: projectInstantToCalendarDate(now, timezone) }
      // @effect-diagnostics-next-line strictEffectProvide:off -- The browser entry point supplies the flags' resource.
    }).pipe(Effect.provide(layerSecureRandom)),
  }
)
