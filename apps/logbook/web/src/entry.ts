import * as Domain from '@alchemy.run/domain'
import { layerSecureRandom } from '@effect/platform-browser/BrowserCrypto'
import { Router } from '@effect/ui'
import { BrowserHost, BrowserRouter } from '@effect/ui/html'
import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import { isoDateFromUtc } from '@garage/logbook-domain/ScheduleMath'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Socket from 'effect/socket/Socket'

import { Logbook } from './Logbook.ts'
import { LogbookRoutes } from './Route.ts'

const protocol = Domain.protocolWebSocket(`${location.origin}/api`).pipe(
  Layer.provide(Layer.mergeAll(Socket.layerWebSocketConstructorGlobal, FetchHttpClient.layer))
)
const connection = LogbookApi.layerClient.pipe(Layer.provide(protocol))

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Logbook mount element is missing.')
}

const props = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom
  const session = yield* random.uuidV4()
  const now = yield* DateTime.now
  const route = yield* Router.currentRoute(LogbookRoutes)
  return { session, today: isoDateFromUtc(now), route }
})

const app = BrowserHost.mount(Logbook, props, root).pipe(
  Layer.provide(Layer.mergeAll(connection, layerSecureRandom, BrowserRouter.layer({ routes: LogbookRoutes })))
)

// oxlint-disable-next-line enfect/effect-run-in-body -- This entry point owns the browser runtime.
Layer.launch(app).pipe(Effect.runFork)
