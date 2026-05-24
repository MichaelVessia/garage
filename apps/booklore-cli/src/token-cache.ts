import { BookloreTokenCache } from '@garage/booklore'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'

const missingToken: string | undefined = undefined

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const cacheDirectory = (path: Path): string => {
  const tmp = Bun.env.TMPDIR ?? '/tmp'
  const user = Bun.env.UID ?? Bun.env.USER ?? 'user'
  return path.join(tmp, `booklore-${encodeHex(user)}`)
}

const tokenPath = (path: Path, key: string): string => path.join(cacheDirectory(path), `${encodeHex(key)}.token`)

export const BookloreTokenCacheFileLive = Layer.effect(
  BookloreTokenCache,
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const path = yield* Path
    return BookloreTokenCache.of({
      read: (key) =>
        fs.readFileString(tokenPath(path, key), 'utf-8').pipe(
          Effect.match({
            onFailure: () => missingToken,
            onSuccess: (token) => token.trim(),
          })
        ),
      write: (key, token) =>
        fs.makeDirectory(cacheDirectory(path), { mode: 0o700, recursive: true }).pipe(
          Effect.andThen(() => fs.writeFileString(tokenPath(path, key), token, { mode: 0o600 })),
          Effect.ignore
        ),
    })
  })
)
