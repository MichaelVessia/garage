import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Hash from 'effect/Hash'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as HttpPlatform from 'effect/unstable/http/HttpPlatform'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'

import { FrameRpcs, FrameVersion } from '#shared'

const RpcRoute = RpcServer.layerHttp({ group: FrameRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(RpcSerialization.layerJson)
)

const VERSION_META = 'frame-version'

// Without an injected build id, fingerprint index.html: it names every content-hashed asset.
const fingerprint = (html: string): string => `${Math.abs(Hash.string(html)).toString(16)}-${html.length}`

const withVersionMeta = (html: string, version: string): string =>
  html.replace('<head>', `<head><meta name="${VERSION_META}" content="${version}" />`)

// Serves the built SPA and its version. Unknown paths fall back to index.html so client routes survive a reload.
const spaRoutes = (webRoot: string, buildId: Option.Option<string>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const platform = yield* HttpPlatform.HttpPlatform
      const root = path.resolve(webRoot)
      const indexHtml = yield* fs.readFileString(path.join(root, 'index.html')).pipe(
        Effect.tapError((failure) => Effect.logWarning('No built SPA in the web root', failure.reason)),
        Effect.orElseSucceed(() => '')
      )
      const version = new FrameVersion({ version: Option.getOrElse(buildId, () => fingerprint(indexHtml)) })
      const page = HttpServerResponse.html(withVersionMeta(indexHtml, version.version)).pipe(
        HttpServerResponse.setHeader('cache-control', 'no-cache')
      )

      const isServableFile = (candidate: string) =>
        candidate.startsWith(`${root}${path.sep}`) && candidate !== path.join(root, 'index.html')
          ? fs.stat(candidate).pipe(
              Effect.map((info) => info.type === 'File'),
              Effect.tapError((failure) => Effect.logDebug('No static file at path', failure.reason)),
              Effect.orElseSucceed(() => false)
            )
          : Effect.succeed(false)

      // Readiness doubles as the version probe the SPA polls to pick up new deploys.
      const HealthRoute = HttpRouter.add(
        'GET',
        '/health',
        HttpServerResponse.jsonUnsafe(
          { status: 'ready', version: version.version },
          { headers: { 'cache-control': 'no-store' } }
        )
      )

      const StaticRoute = HttpRouter.add(
        'GET',
        '/*',
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const pathname = decodeURIComponent(new URL(request.url, 'http://frame.local').pathname)
          const candidate = path.resolve(root, `.${pathname}`)
          if (!(yield* isServableFile(candidate))) {
            return page
          }
          const cacheControl = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
          return yield* platform.fileResponse(candidate, { headers: { 'cache-control': cacheControl } }).pipe(
            Effect.tapError((failure) => Effect.logWarning('Static file could not be served', failure.reason)),
            Effect.orElseSucceed(() => HttpServerResponse.text('Not found', { status: 404 }))
          )
        })
      )

      return Layer.merge(HealthRoute, StaticRoute)
    })
  )

/** Health, RPC, and SPA routes for the frame server. `buildId` names the deployed build. */
export const frameRoutes = (webRoot: string, buildId: Option.Option<string>) =>
  Layer.merge(RpcRoute, spaRoutes(webRoot, buildId))
