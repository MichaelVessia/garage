import * as Effect from 'effect/Effect'

import { BrowserDownloadError } from '../errors.js'

export interface DownloadTextFileOptions {
  readonly contents: string
  readonly filename: string
  readonly mediaType: string
}

const browserDownloadError = () => new BrowserDownloadError({ message: 'Browser download failed' })

const attempt = <A>(evaluate: () => A): Effect.Effect<A, BrowserDownloadError> =>
  Effect.try({ catch: browserDownloadError, try: evaluate })

export const downloadTextFile = Effect.fn('browserDownload.downloadTextFile')(
  ({ contents, filename, mediaType }: DownloadTextFileOptions) =>
    Effect.scoped(
      Effect.gen(function* () {
        const blob = yield* attempt(() => new Blob([contents], { type: mediaType }))
        const url = yield* Effect.acquireRelease(
          attempt(() => URL.createObjectURL(blob)),
          (objectUrl) =>
            attempt(() => {
              URL.revokeObjectURL(objectUrl)
            }).pipe(
              Effect.tapError((error) => Effect.logDebug('Failed to revoke browser download URL', { error })),
              Effect.ignore
            )
        )
        const anchor = yield* Effect.acquireRelease(
          attempt(() => {
            const element = globalThis.document.createElement('a')
            element.href = url
            element.download = filename
            globalThis.document.body.append(element)
            return element
          }),
          (element) =>
            attempt(() => {
              element.remove()
            }).pipe(
              Effect.tapError((error) => Effect.logDebug('Failed to remove browser download anchor', { error })),
              Effect.ignore
            )
        )
        yield* attempt(() => {
          anchor.click()
        })
      })
    )
)
