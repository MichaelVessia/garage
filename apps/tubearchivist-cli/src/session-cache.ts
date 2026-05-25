import { SessionCookiesSchema, TubearchivistSessionCache } from '@garage/tubearchivist'
import type { SessionCookies } from '@garage/tubearchivist'
import { Config, Effect, Layer, Schema } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'

const missingSession: SessionCookies | undefined = undefined

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const encodeSession = Schema.encodeSync(Schema.fromJsonString(SessionCookiesSchema))

const cacheDirectory = (path: Path): Effect.Effect<string> =>
  Effect.gen(function* () {
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
      read: (key) =>
        sessionPath(path, key).pipe(
          Effect.flatMap((file) => fs.readFileString(file, 'utf-8')),
          Effect.match({
            onFailure: () => missingSession,
            onSuccess: decodeSession,
          })
        ),
      write: (key, session) =>
        Effect.gen(function* () {
          const directory = yield* cacheDirectory(path)
          const file = yield* sessionPath(path, key)
          yield* fs.makeDirectory(directory, { mode: 0o700, recursive: true })
          yield* fs.writeFileString(file, encodeSession(session), { mode: 0o600 })
        }).pipe(Effect.ignore),
    })
  })
)
