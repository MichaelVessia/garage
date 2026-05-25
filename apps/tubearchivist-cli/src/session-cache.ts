import { SessionCookiesSchema, TubearchivistSessionCache } from '@garage/tubearchivist'
import type { SessionCookies } from '@garage/tubearchivist'
import { Config, Effect, Layer, Schema } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'

const missingSession: SessionCookies | undefined = undefined

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const encodeSession = Schema.encodeSync(Schema.fromJsonString(SessionCookiesSchema))

const cacheDirectory = Effect.fn('tubearchivist.sessionCache.cacheDirectory')(function* (
  path: Path
): Effect.fn.Return<string> {
  const tmp = yield* Config.string('TMPDIR').pipe(Effect.orElseSucceed(() => '/tmp'))
  const user = yield* Config.string('UID').pipe(
    Config.orElse(() => Config.string('USER')),
    Effect.orElseSucceed(() => 'user')
  )
  return path.join(tmp, `tubearchivist-${encodeHex(user)}`)
})

const sessionPath = (path: Path, key: string): Effect.Effect<string> =>
  cacheDirectory(path).pipe(Effect.map((directory) => path.join(directory, `${encodeHex(key)}.json`)))

const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const decodeSession = (input: string): SessionCookies | undefined => {
  try {
    const parsed: unknown = JSON.parse(input)
    if (!isJsonObject(parsed)) {
      return undefined
    }
    const { sessionId, csrfToken } = parsed
    return typeof sessionId === 'string' && typeof csrfToken === 'string' ? { sessionId, csrfToken } : undefined
  } catch {
    return undefined
  }
}

export const TubearchivistSessionCacheFileLive = Layer.effect(
  TubearchivistSessionCache,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const path = yield* Path
    return TubearchivistSessionCache.of({
      read: Effect.fn('TubearchivistSessionCache.read')(
        function* (key) {
          return yield* sessionPath(path, key).pipe(
            Effect.flatMap((file) => fs.readFileString(file, 'utf-8')),
            Effect.match({
              onFailure: () => missingSession,
              onSuccess: decodeSession,
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistSessionCache', method: 'read' })
      ),
      write: Effect.fn('TubearchivistSessionCache.write')(
        function* (key: string, session: SessionCookies): Effect.fn.Return<void> {
          return yield* Effect.all(
            { directory: cacheDirectory(path), file: sessionPath(path, key) },
            { concurrency: 1 }
          ).pipe(
            Effect.flatMap(({ directory, file }) =>
              fs
                .makeDirectory(directory, { mode: 0o700, recursive: true })
                .pipe(Effect.flatMap(() => fs.writeFileString(file, encodeSession(session), { mode: 0o600 })))
            ),
            Effect.ignore
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistSessionCache', method: 'write' })
      ),
    })
  })
)
