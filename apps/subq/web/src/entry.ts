import * as Domain from '@alchemy.run/domain'
import { layerSecureRandom } from '@effect/platform-browser/BrowserCrypto'
import { Router } from '@effect/ui'
import { BrowserHost, BrowserRouter } from '@effect/ui/html'
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

import { SubmitJournalCommand } from './client.ts'
import { MissingRoot } from './errors.ts'
import { Subq } from './main.ts'
import { ApplyPreset } from './page/stats/command.ts'
import { AppRoute } from './route.ts'

const container = document.querySelector<HTMLElement>('#root')

if (container === null) {
  throw MissingRoot.make({})
}

const protocol = Domain.protocolWebSocket(`${location.origin}/api`).pipe(
  Layer.provide(Layer.mergeAll(Socket.layerWebSocketConstructorGlobal, FetchHttpClient.layer))
)
const connection = SubqApi.layerClient.pipe(Layer.provide(protocol))

const flags = Effect.gen(function* () {
  const route = yield* Router.currentRoute(AppRoute)
  const random = yield* SecureRandom.SecureRandom
  const session = yield* random.uuidV4()
  const now = yield* DateTime.now
  const timezone = Schema.decodeOption(IanaTimezone)(Intl.DateTimeFormat().resolvedOptions().timeZone).pipe(
    Option.getOrElse(() => IanaTimezone.make('UTC'))
  )
  return { route, session, timezone, today: projectInstantToCalendarDate(now, timezone) }
})

const app = BrowserHost.mount(Subq, flags, container).pipe(
  Layer.provide([ApplyPreset.layer, SubmitJournalCommand.layer])
)
const main = app.pipe(
  Layer.provide([BrowserHost.layer(), BrowserRouter.layer({ routes: AppRoute }), layerSecureRandom, connection])
)

// oxlint-disable-next-line enfect/effect-run-in-body -- This module is the browser entry point.
Layer.launch(main).pipe(Effect.runFork)
