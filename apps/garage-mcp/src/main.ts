import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '@garage/autocaliweb'
import { SabnzbdApiLive, SabnzbdConfigLive } from '@garage/sabnzbd'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'

import { GarageMcpRoutes } from './server.js'

const AutocaliwebConfiguredLive = AutocaliwebApiLive.pipe(Layer.provideMerge(AutocaliwebConfigLive))

const AutocaliwebLive = AutocaliwebConfiguredLive.pipe(Layer.provide(BunHttpClient.layer))

const SabnzbdConfiguredLive = SabnzbdApiLive.pipe(Layer.provideMerge(SabnzbdConfigLive))

const SabnzbdLive = SabnzbdConfiguredLive.pipe(Layer.provide(BunHttpClient.layer))

const GarageServicesLive = Layer.merge(AutocaliwebLive, SabnzbdLive)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Int('GARAGE_MCP_PORT').pipe(Config.withDefault(3000))

    return HttpRouter.serve(GarageMcpRoutes.pipe(Layer.provide(GarageServicesLive))).pipe(
      Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port }))
    )
  })
)

BunRuntime.runMain(Layer.launch(HttpServerLive))
