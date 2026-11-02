import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'

import { CalendarFeedLive } from './calendar/http.js'
import { CalendarConfigLive } from './calendar/services.js'
import { FrameHandlersLive } from './handlers.js'
import { HomeAssistantApiLive } from './home-assistant/http.js'
import { HomeAssistantConfigLive } from './home-assistant/services.js'
import { frameRoutes } from './server.js'
import { FrameTimezoneLive } from './settings.js'

const CalendarLive = CalendarFeedLive.pipe(Layer.provide(CalendarConfigLive))

const HomeAssistantLive = HomeAssistantApiLive.pipe(Layer.provide(HomeAssistantConfigLive))

const FrameServicesLive = Layer.merge(CalendarLive, HomeAssistantLive).pipe(
  Layer.provideMerge(FrameTimezoneLive),
  Layer.provide(BunHttpClient.layer)
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.int('FRAME_PORT').pipe(Config.withDefault(8080))
    const webRoot = yield* Config.nonEmptyString('FRAME_WEB_ROOT').pipe(Config.withDefault('web/dist'))

    return HttpRouter.serve(
      frameRoutes(webRoot).pipe(Layer.provide(FrameHandlersLive), Layer.provide(FrameServicesLive))
    ).pipe(Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port })))
  })
)

BunRuntime.runMain(Layer.launch(HttpServerLive))
