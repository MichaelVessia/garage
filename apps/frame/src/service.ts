import { Context as DockerContext, Service as DockerService, Swarm as DockerSwarm } from '@alchemy.run/docker'
import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform'
import * as BunServices from '@effect/platform-bun/BunServices'
import { adopt } from 'alchemy/AdoptPolicy'
import { ServerHost } from 'alchemy/Runtime/Process'
import * as Config from 'effect/Config'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

import { FrameAppLive } from './app.js'
import { embeddedWeb } from './embedded-web.js'
import { frameRoutes, WebAssets } from './server.js'
import { CONTAINER_ENV_FILE, FrameEnvFileLive, HOST_ENV_FILE } from './settings.js'
import { readEmbeddedWeb, renderEmbeddedWebModule } from './web-assets.js'

const PORT = 8080

const BASE_SERVICE_PROPS = {
  name: 'garage-frame',
  main: import.meta.filename,
  port: PORT,
  // `mode: 'host'` publishes port 8080 straight on the LXC host instead of going through
  // Swarm's IPVS/VXLAN ingress mesh, which avoids LXC kernel restrictions.
  ports: [{ external: PORT, internal: PORT, mode: 'host' as const }],
  readOnlyRootFs: true,
  // Host-mode port publishing cannot bind two tasks on 8080 at once, so stop before start.
  updateConfig: { order: 'stop-first' as const, failureAction: 'rollback' as const },
  restartPolicy: { condition: 'any' as const },
  // Bind mounts resolve on the Docker host, so credentials never leave it.
  volumes: [{ hostPath: HOST_ENV_FILE, containerPath: CONTAINER_ENV_FILE, readOnly: true }],
  environment: { FRAME_ENV_FILE: CONTAINER_ENV_FILE },
  healthcheck: {
    cmd: ['CMD', 'bun', '-e', `const r = await fetch("http://127.0.0.1:${PORT}/health"); if (!r.ok) process.exit(1)`],
    interval: '30s',
    timeout: '5s',
    retries: 3,
    startPeriod: '10s',
  },
  stopGracePeriod: '10s',
}

const PlatformLive = Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer, BunHttpClient.layer)

const ConfigLive = FrameEnvFileLive.pipe(Layer.provideMerge(PlatformLive))

const RuntimeAppLive = FrameAppLive.pipe(Layer.provideMerge(ConfigLive))

const createRuntimeHandler = Effect.fn('frame.service.createRuntimeHandler')(function* () {
  const buildId = yield* Config.NonEmptyString('FRAME_BUILD_ID').pipe(Config.option)
  const webRoot = yield* Config.NonEmptyString('FRAME_WEB_ROOT').pipe(Config.withDefault('web/dist'))

  const webAssets: WebAssets = Option.match(embeddedWeb, {
    onNone: () => WebAssets.Directory({ webRoot }),
    onSome: (web) => WebAssets.Embedded({ web }),
  })

  const appLayer = frameRoutes({ webAssets, buildId }).pipe(Layer.provide(RuntimeAppLive))

  return yield* HttpRouter.toHttpEffect(appLayer)
})

type FrameHttpHandler = Effect.Success<ReturnType<typeof createRuntimeHandler>>

// Alchemy loads the bundled Docker service through its default export.
export default class FrameService extends DockerService<FrameService>()(
  'frame',
  Effect.gen(function* () {
    const dockerHost = yield* Config.NonEmptyString('FRAME_DOCKER_HOST').pipe(Config.option)

    // At container runtime `FRAME_DOCKER_HOST` is unset; skip deploy-only Swarm and asset-bundling setup.
    if (Option.isNone(dockerHost)) {
      return BASE_SERVICE_PROPS
    }

    const advertiseAddr = yield* Config.NonEmptyString('FRAME_SWARM_ADVERTISE_ADDR').pipe(Config.option)
    const path = yield* Path.Path
    const sourceDir = path.dirname(import.meta.filename)
    const embeddedModulePath = path.resolve(sourceDir, 'embedded-web.ts')

    const embeddedModuleSource = yield* readEmbeddedWeb(path.resolve(sourceDir, '../web/dist')).pipe(
      Effect.flatMap(renderEmbeddedWebModule),
      Effect.orDie
    )

    const host = yield* DockerContext('frame-host', {
      docker: `host=${dockerHost.value}`,
      description: 'garage-frame host',
    })

    const swarm = yield* DockerSwarm(
      'frame-swarm',
      Option.match(advertiseAddr, {
        onNone: () => ({ context: host }),
        onSome: (addr) => ({ context: host, advertiseAddr: addr }),
      })
    ).pipe(adopt(true))

    return {
      ...BASE_SERVICE_PROPS,
      context: swarm,
      build: {
        input: {
          plugins: [
            {
              name: 'frame-embed-web',
              load: (id: string) => (path.resolve(id) === embeddedModulePath ? embeddedModuleSource : null),
            },
          ],
        },
      },
    }
  }),
  Effect.gen(function* () {
    const serverHost = yield* ServerHost
    const handlerReady = yield* Deferred.make<FrameHttpHandler>()

    // Runs only inside the container (never at plan time), keeping host credentials off the deploying machine
    // and keeping the calendar cache and HTTP client scope alive for the process lifetime.
    yield* serverHost.run(
      Effect.scoped(
        Effect.gen(function* () {
          const handler = yield* createRuntimeHandler()
          yield* Deferred.succeed(handlerReady, handler)

          return yield* Effect.never
        })
      ).pipe(Effect.orDie)
    )

    return {
      fetch: Deferred.await(handlerReady).pipe(Effect.flatten, Effect.orDie),
    }
  })
) {}
