import { SessionCookies, TubearchivistSessionCache } from '@garage/tubearchivist'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import { FileSystem } from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { Path } from 'effect/Path'
import * as Schema from 'effect/Schema'

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const sessionFromJsonString = Schema.fromJsonString(SessionCookies)
const encodeSession = Schema.encodeSync(sessionFromJsonString)
const decodeSession = Schema.decodeUnknownOption(sessionFromJsonString)

const cacheDirectory = Effect.fn('tubearchivist.sessionCache.cacheDirectory')(function* (
  path: Path
): Effect.fn.Return<string> {
  const tmp = yield* Config.string('TMPDIR').pipe(
    Effect.tapError((error) => Effect.logDebug('TMPDIR config unavailable, using default', { error })),
    Effect.orElseSucceed(() => '/tmp')
  )
  const user = yield* Config.string('UID').pipe(
    Config.orElse(() => Config.string('USER')),
    Effect.tapError((error) => Effect.logDebug('UID/USER config unavailable, using default', { error })),
    Effect.orElseSucceed(() => 'user')
  )
  return path.join(tmp, `tubearchivist-${encodeHex(user)}`)
})

const sessionPath = (path: Path, key: string): Effect.Effect<string> =>
  cacheDirectory(path).pipe(Effect.map((directory) => path.join(directory, `${encodeHex(key)}.json`)))

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
              onFailure: () => Option.none<SessionCookies>(),
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
            Effect.tapError((error) => Effect.logDebug('session cache write failed', { error })),
            Effect.ignore
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistSessionCache', method: 'write' })
      ),
    })
  })
)
