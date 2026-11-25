import * as Domain from '@alchemy.run/domain'
import { layerSecureRandom } from '@effect/platform-browser/BrowserCrypto'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Socket from 'effect/socket/Socket'
import { Runtime } from 'foldkit'

import { subscriptions, update } from './Logbook.ts'
import { Flags, init, Model } from './Model.ts'
import { view } from './View.ts'

const protocol = Domain.protocolWebSocket(`${location.origin}/api`).pipe(
  Layer.provide(Layer.mergeAll(Socket.layerWebSocketConstructorGlobal, FetchHttpClient.layer))
)
const connection = LogbookApi.layerClient.pipe(Layer.provide(protocol))

Runtime.run(
  Runtime.makeApplication({
    Flags,
    Model,
    init,
    update,
    view,
    subscriptions,
    resources: connection,
    container: document.getElementById('root'),
  }),
  {
    flags: Effect.gen(function* () {
      const random = yield* SecureRandom.SecureRandom
      const session = yield* random.uuidV4()
      const now = yield* DateTime.now
      return { session, today: isoDateFromUtc(now) }
      // @effect-diagnostics-next-line strictEffectProvide:off -- The browser entry point supplies the flags' resource.
    }).pipe(Effect.provide(layerSecureRandom)),
  }
)
