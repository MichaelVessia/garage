import { BunHttpClient, BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'

import { FrameAppLive } from './app.js'
import { frameRoutes, WebAssets } from './server.js'
import { FrameEnvFileLive } from './settings.js'

const FrameServicesLive = FrameAppLive.pipe(Layer.provide(BunHttpClient.layer))

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Int('FRAME_PORT').pipe(Config.withDefault(8080))
    const webRoot = yield* Config.NonEmptyString('FRAME_WEB_ROOT').pipe(Config.withDefault('web/dist'))
    const buildId = yield* Config.NonEmptyString('FRAME_BUILD_ID').pipe(Config.option)

    const routes = frameRoutes({ webAssets: WebAssets.Directory({ webRoot }), buildId }).pipe(
      Layer.provide(FrameServicesLive)
    )

    return HttpRouter.serve(routes).pipe(Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port })))
  })
)

const ConfigLive = FrameEnvFileLive.pipe(Layer.provide(BunServices.layer))

BunRuntime.runMain(Layer.launch(HttpServerLive.pipe(Layer.provide(ConfigLive))))
