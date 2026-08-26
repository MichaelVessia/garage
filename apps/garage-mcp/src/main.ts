import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { SabnzbdApiLive, SabnzbdConfigLive } from '@garage/sabnzbd'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'

import { GarageMcpRoutes } from './server.js'

const SabnzbdLive = SabnzbdApiLive.pipe(Layer.provideMerge(SabnzbdConfigLive), Layer.provide(BunHttpClient.layer))

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.int('GARAGE_MCP_PORT').pipe(Config.withDefault(3000))

    return HttpRouter.serve(GarageMcpRoutes.pipe(Layer.provide(SabnzbdLive))).pipe(
      Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port }))
    )
  })
)

BunRuntime.runMain(Layer.launch(HttpServerLive))
