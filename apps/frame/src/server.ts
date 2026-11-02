import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Hash from 'effect/Hash'
import * as HttpPlatform from 'effect/http/HttpPlatform'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'
import * as RpcServer from 'effect/rpc/RpcServer'
import * as Str from 'effect/String'

import { FrameRpcs, FrameVersion } from '#shared'

import { HomeAssistantApi } from './home-assistant/services.js'

const RpcRoute = RpcServer.layerHttp({ group: FrameRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(RpcSerialization.layerJson)
)

const VERSION_META = 'frame-version'

// Without an injected build id, fingerprint index.html: it names every content-hashed asset.
const fingerprint = (html: string): string => `${Math.abs(Hash.string(html)).toString(16)}-${html.length}`

const withVersionMeta = (html: string, version: string): string =>
  Str.replace('<head>', `<head><meta name="${VERSION_META}" content="${version}" />`)(html)

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

      const version = FrameVersion.make({ version: Option.getOrElse(buildId, () => fingerprint(indexHtml)) })

      const page = HttpServerResponse.html(withVersionMeta(indexHtml, version.version)).pipe(
        HttpServerResponse.setHeader('cache-control', 'no-cache')
      )

      const isServableFile = (candidate: string) =>
        Str.startsWith(`${root}${path.sep}`)(candidate) && candidate !== path.join(root, 'index.html')
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

          const cacheControl = Str.startsWith('/assets/')(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache'

          return yield* platform.fileResponse(candidate, { headers: { 'cache-control': cacheControl } }).pipe(
            Effect.tapError((failure) => Effect.logWarning('Static file could not be served', failure.reason)),
            Effect.orElseSucceed(() => HttpServerResponse.text('Not found', { status: 404 }))
          )
        })
      )

      return Layer.merge(HealthRoute, StaticRoute)
    })
  )

const ARTWORK_PATH = '/media/art/'

// Media artwork comes from Home Assistant, which the frame cannot reach. Only configured players are
// served; the browser never sees Home Assistant URLs or the token.
const ArtworkRoute = Layer.unwrap(
  Effect.gen(function* () {
    const homeAssistant = yield* HomeAssistantApi

    return HttpRouter.add(
      'GET',
      `${ARTWORK_PATH}*`,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest

        const entityId = decodeURIComponent(
          Str.slice(ARTWORK_PATH.length)(new URL(request.url, 'http://frame.local').pathname)
        )

        return yield* homeAssistant.mediaArtwork(entityId).pipe(
          Effect.map(
            Option.match({
              onNone: () => HttpServerResponse.text('Not found', { status: 404 }),
              onSome: ({ bytes, contentType }) =>
                HttpServerResponse.uint8Array(bytes, {
                  contentType,
                  headers: { 'cache-control': 'private, max-age=300' },
                }),
            })
          ),
          Effect.tapError((failure) =>
            Effect.logWarning('Media artwork unavailable').pipe(Effect.annotateLogs({ code: failure.code }))
          ),
          Effect.orElseSucceed(() => HttpServerResponse.text('Artwork unavailable', { status: 502 }))
        )
      })
    )
  })
)

type FrameRoutesServices =
  | Layer.Services<typeof RpcRoute>
  | Layer.Services<typeof ArtworkRoute>
  | Layer.Services<ReturnType<typeof spaRoutes>>

/** Health, RPC, media artwork, and SPA routes for the frame server. `buildId` names the deployed build. */
export const frameRoutes = ({
  webRoot,
  buildId,
}: {
  readonly webRoot: string
  readonly buildId: Option.Option<string>
}): Layer.Layer<never, never, FrameRoutesServices> =>
  Layer.mergeAll(RpcRoute, ArtworkRoute, spaRoutes(webRoot, buildId))
