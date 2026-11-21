import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Base64 from 'effect/encoding/Base64'
import * as FileSystem from 'effect/FileSystem'
import * as Hash from 'effect/Hash'
import * as HashMap from 'effect/HashMap'
import * as HttpPlatform from 'effect/http/HttpPlatform'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as R from 'effect/Record'
import * as Result from 'effect/Result'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'
import * as RpcServer from 'effect/rpc/RpcServer'
import * as Str from 'effect/String'

import { FrameRpcs, FrameVersion } from '#shared'

import { HomeAssistantApi } from './home-assistant/services.js'
import type { EmbeddedWeb } from './web-assets.js'

const RpcRoute = RpcServer.layerHttp({ group: FrameRpcs, path: '/rpc', protocol: 'http' }).pipe(
  Layer.provide(RpcSerialization.layerJson)
)

const VERSION_META = 'frame-version'

/** Fingerprint `index.html` into a build version; it names every content-hashed Vite asset. */
export const fingerprintHtml = (html: string): string => `${Math.abs(Hash.string(html)).toString(16)}-${html.length}`

const withVersionMeta = (html: string, version: string): string =>
  Str.replace('<head>', `<head><meta name="${VERSION_META}" content="${version}" />`)(html)

const cacheControlFor = (pathname: string): string =>
  Str.startsWith('/assets/')(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache'

const makeHealthAndPage = (indexHtml: string, buildId: Option.Option<string>) => {
  const version = FrameVersion.make({ version: Option.getOrElse(buildId, () => fingerprintHtml(indexHtml)) })

  const page = HttpServerResponse.html(withVersionMeta(indexHtml, version.version)).pipe(
    HttpServerResponse.setHeader('cache-control', 'no-cache')
  )

  // Readiness doubles as the version probe the SPA polls to pick up new deploys.
  const HealthRoute = HttpRouter.add(
    'GET',
    '/health',
    HttpServerResponse.jsonUnsafe(
      { status: 'ready', version: version.version },
      { headers: { 'cache-control': 'no-store' } }
    )
  )

  return { page, HealthRoute }
}

interface DecodedEmbeddedAsset {
  readonly contentType: string
  readonly bytes: Uint8Array
}

const decodeEmbeddedAssets = (web: EmbeddedWeb): HashMap.HashMap<string, DecodedEmbeddedAsset> =>
  HashMap.fromIterable(
    Arr.filterMap(R.toEntries(web.assets), ([pathname, asset]) =>
      Result.match(Base64.decode(asset.base64), {
        onSuccess: (bytes) =>
          Result.succeed<readonly [string, DecodedEmbeddedAsset]>([
            pathname,
            { contentType: asset.contentType, bytes },
          ]),
        onFailure: () => Result.failVoid,
      })
    )
  )

/** Where the server reads the built SPA from: a directory on disk or an embedded bundle. */
export type WebAssets = Data.TaggedEnum<{
  readonly Directory: { readonly webRoot: string }
  readonly Embedded: { readonly web: EmbeddedWeb }
}>

export const WebAssets = Data.taggedEnum<WebAssets>()

const directorySpaRoutes = (webRoot: string, buildId: Option.Option<string>) =>
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

      const { page, HealthRoute } = makeHealthAndPage(indexHtml, buildId)

      const isServableFile = (candidate: string) =>
        Str.startsWith(`${root}${path.sep}`)(candidate) && candidate !== path.join(root, 'index.html')
          ? fs.stat(candidate).pipe(
              Effect.map((info) => info.type === 'File'),
              Effect.tapError((failure) => Effect.logDebug('No static file at path', failure.reason)),
              Effect.orElseSucceed(() => false)
            )
          : Effect.succeed(false)

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

          return yield* platform
            .fileResponse(candidate, { headers: { 'cache-control': cacheControlFor(pathname) } })
            .pipe(
              Effect.tapError((failure) => Effect.logWarning('Static file could not be served', failure.reason)),
              Effect.orElseSucceed(() => HttpServerResponse.text('Not found', { status: 404 }))
            )
        })
      )

      return Layer.merge(HealthRoute, StaticRoute)
    })
  )

const embeddedSpaRoutes = (web: EmbeddedWeb, buildId: Option.Option<string>) => {
  const { page, HealthRoute } = makeHealthAndPage(web.indexHtml, buildId)
  const assets = decodeEmbeddedAssets(web)

  const StaticRoute = HttpRouter.add(
    'GET',
    '/*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const pathname = decodeURIComponent(new URL(request.url, 'http://frame.local').pathname)

      return Option.match(HashMap.get(assets, pathname), {
        onNone: () => page,
        onSome: ({ bytes, contentType }) =>
          HttpServerResponse.uint8Array(bytes, {
            contentType,
            headers: { 'cache-control': cacheControlFor(pathname) },
          }),
      })
    })
  )

  return Layer.merge(HealthRoute, StaticRoute)
}

// Serves the built SPA and its version. Unknown paths fall back to index.html so client routes survive a reload.
const spaRoutes = (webAssets: WebAssets, buildId: Option.Option<string>) =>
  Match.valueTags(webAssets, {
    Directory: ({ webRoot }) => directorySpaRoutes(webRoot, buildId),
    Embedded: ({ web }) => embeddedSpaRoutes(web, buildId),
  })

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
  | Layer.Services<ReturnType<typeof directorySpaRoutes>>

/** Health, RPC, media artwork, and SPA routes for the frame server. `buildId` names the deployed build. */
export const frameRoutes = ({
  webAssets,
  buildId,
}: {
  readonly webAssets: WebAssets
  readonly buildId: Option.Option<string>
}): Layer.Layer<never, never, FrameRoutesServices> =>
  Layer.mergeAll(RpcRoute, ArtworkRoute, spaRoutes(webAssets, buildId))
