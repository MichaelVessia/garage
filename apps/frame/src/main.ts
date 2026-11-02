import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'

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
    const port = yield* Config.Int('FRAME_PORT').pipe(Config.withDefault(8080))
    const webRoot = yield* Config.NonEmptyString('FRAME_WEB_ROOT').pipe(Config.withDefault('web/dist'))
    const buildId = yield* Config.NonEmptyString('FRAME_BUILD_ID').pipe(Config.option)

    return HttpRouter.serve(
      frameRoutes(webRoot, buildId).pipe(Layer.provide(FrameHandlersLive), Layer.provide(FrameServicesLive))
    ).pipe(Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port })))
  })
)

BunRuntime.runMain(Layer.launch(HttpServerLive))
