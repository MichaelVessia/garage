import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Base64 from 'effect/encoding/Base64'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Path from 'effect/Path'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

const EmbeddedAsset = Schema.Struct({
  contentType: Schema.String,
  base64: Schema.String,
})

type EmbeddedAsset = typeof EmbeddedAsset.Type

const EmbeddedWeb = Schema.Struct({
  indexHtml: Schema.String,
  assets: Schema.Record(Schema.String, EmbeddedAsset),
})

export type EmbeddedWeb = typeof EmbeddedWeb.Type

const CONTENT_TYPES = HashMap.fromIterable<string, string>(
  R.toEntries({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  })
)

const contentTypeFor = (filePath: string, path: Path.Path): string =>
  Option.getOrElse(
    HashMap.get(CONTENT_TYPES, Str.toLowerCase(path.extname(filePath))),
    () => 'application/octet-stream'
  )

const encodeEmbeddedWebJson = Schema.encodeEffect(Schema.fromJsonString(EmbeddedWeb))

/** Read a built SPA directory into a self-contained payload for container bundling. */
export const readEmbeddedWeb = Effect.fn('frame.webAssets.readEmbeddedWeb')(function* (webDistDir: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(webDistDir)
  const indexHtml = yield* fs.readFileString(path.join(root, 'index.html'))
  const entries = yield* fs.readDirectory(root, { recursive: true })

  const assetOptions = yield* Effect.forEach(
    Arr.sort(
      Arr.filter(entries, (entry) => entry !== 'index.html'),
      Order.String
    ),
    (relativeFile) => {
      const fullPath = path.join(root, relativeFile)

      return fs.stat(fullPath).pipe(
        Effect.flatMap((info) =>
          info.type === 'File'
            ? fs.readFile(fullPath).pipe(
                Effect.map((bytes) =>
                  Option.some<readonly [string, EmbeddedAsset]>([
                    `/${Str.replaceAll('\\', '/')(relativeFile)}`,
                    {
                      contentType: contentTypeFor(relativeFile, path),
                      base64: Base64.encode(bytes),
                    },
                  ])
                )
              )
            : Effect.succeed(Option.none<readonly [string, EmbeddedAsset]>())
        )
      )
    },
    { concurrency: 8 }
  )

  return EmbeddedWeb.make({
    indexHtml,
    assets: R.fromEntries(Arr.getSomes(assetOptions)),
  })
})

/** Render the replacement ESM source for `src/embedded-web.ts` during container bundling. */
export const renderEmbeddedWebModule = Effect.fn('frame.webAssets.renderEmbeddedWebModule')(function* (
  web: EmbeddedWeb
) {
  const encoded = yield* encodeEmbeddedWebJson(web)

  return `import * as Option from 'effect/Option'\nexport const embeddedWeb = Option.some(${encoded})\n`
})
