import { TubearchivistSessionCache } from '@garage/tubearchivist'
import type { SessionCookies } from '@garage/tubearchivist'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'

const missingSession: SessionCookies | undefined = undefined

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const cacheDirectory = (path: Path): string => {
  const tmp = Bun.env.TMPDIR ?? '/tmp'
  const user = Bun.env.UID ?? Bun.env.USER ?? 'user'
  return path.join(tmp, `tubearchivist-${encodeHex(user)}`)
}

const sessionPath = (path: Path, key: string): string => path.join(cacheDirectory(path), `${encodeHex(key)}.json`)

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
        fs.readFileString(sessionPath(path, key), 'utf-8').pipe(
          Effect.match({
            onFailure: () => missingSession,
            onSuccess: decodeSession,
          })
        ),
      write: (key, session) =>
        fs.makeDirectory(cacheDirectory(path), { mode: 0o700, recursive: true }).pipe(
          Effect.andThen(() => fs.writeFileString(sessionPath(path, key), JSON.stringify(session), { mode: 0o600 })),
          Effect.ignore
        ),
    })
  })
)
