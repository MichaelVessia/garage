import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'

import { FrameRpcs } from '#shared'

const HealthRoute = HttpRouter.add('GET', '/health', HttpServerResponse.jsonUnsafe({ status: 'ready' }))

const RpcRoute = RpcServer.layerHttp({ group: FrameRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(RpcSerialization.layerJson)
)

// Serves the built SPA. Unknown paths fall back to index.html so client routes survive a reload.
const staticRoute = (webRoot: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const platform = yield* HttpPlatform.HttpPlatform
      const root = path.resolve(webRoot)

      const isServableFile = (candidate: string) =>
        candidate.startsWith(`${root}${path.sep}`)
          ? fs.stat(candidate).pipe(
              Effect.map((info) => info.type === 'File'),
              Effect.tapError((failure) => Effect.logDebug('No static file at path', failure.reason)),
              Effect.orElseSucceed(() => false)
            )
          : Effect.succeed(false)

      return HttpRouter.add(
        'GET',
        '/*',
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const pathname = decodeURIComponent(new URL(request.url, 'http://frame.local').pathname)
          const candidate = path.resolve(root, `.${pathname}`)
          const isFile = yield* isServableFile(candidate)
          const cacheControl =
            isFile && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
          return yield* platform
            .fileResponse(isFile ? candidate : path.join(root, 'index.html'), {
              headers: { 'cache-control': cacheControl },
            })
            .pipe(
              Effect.tapError((failure) => Effect.logWarning('Static file could not be served', failure.reason)),
              Effect.orElseSucceed(() => HttpServerResponse.text('Not found', { status: 404 }))
            )
        })
      )
    })
  )

/** Health, RPC, and SPA routes for the frame server. */
export const frameRoutes = (webRoot: string) => Layer.mergeAll(HealthRoute, RpcRoute, staticRoute(webRoot))
