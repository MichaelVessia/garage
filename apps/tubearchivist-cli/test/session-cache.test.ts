import * as BunFileSystem from '@effect/platform-bun/BunFileSystem'
import * as BunPath from '@effect/platform-bun/BunPath'
import { assert, describe, it } from '@effect/vitest'
import { TubearchivistSessionCache } from '@garage/tubearchivist'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Option from 'effect/Option'
import { Path } from 'effect/Path'
import * as PlatformError from 'effect/PlatformError'
import * as Random from 'effect/Random'
import * as References from 'effect/References'

import { TubearchivistSessionCacheFileLive } from '../src/session-cache.js'

const encodeHex = (value: string): string =>
  [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const configLayer = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromEnv({ env }))

const cacheLayer = (fileSystemLayer: Layer.Layer<FileSystem.FileSystem>) =>
  TubearchivistSessionCacheFileLive.pipe(Layer.provide(Layer.mergeAll(fileSystemLayer, BunPath.layer)))

const provideCache = <A, E, R>(
  effect: Effect.Effect<A, E, R | TubearchivistSessionCache>,
  env: Record<string, string>,
  fileSystemLayer: Layer.Layer<FileSystem.FileSystem>
) => effect.pipe(Effect.provide(Layer.mergeAll(cacheLayer(fileSystemLayer), configLayer(env))))

const fileError = (tag: PlatformError.SystemErrorTag, method: string) =>
  PlatformError.systemError({ _tag: tag, module: 'FileSystem', method })

const recordedReadPath = (env: Record<string, string>, key = 'https://tube.example.test/user?name=a/b') => {
  const paths: Array<string> = []
  const fileSystemLayer = FileSystem.layerNoop({
    readFileString: (path) => {
      paths.push(path)
      return Effect.succeed('{}')
    },
  })
  return provideCache(
    Effect.gen(function* () {
      const cache = yield* TubearchivistSessionCache
      yield* cache.read(key)
      const [path] = paths
      if (path === undefined) {
        return assert.fail('expected one filesystem read')
      }
      return path
    }),
    env,
    fileSystemLayer
  )
}

const session = { csrfToken: 'csrf', sessionId: 'sid' }

// Session cache behavior is deliberately characterized at the filesystem boundary.
describe('TubeArchivist session cache policy', () => {
  it.effect('prefers UID, falls back to USER, then uses the documented defaults', () =>
    Effect.gen(function* () {
      const uidPath = yield* recordedReadPath({ TMPDIR: '/cache', UID: '1001', USER: 'named-user' })
      const userPath = yield* recordedReadPath({ TMPDIR: '/cache', USER: 'named-user' })
      const defaultPath = yield* recordedReadPath({})

      assert.strictEqual(
        uidPath,
        `/cache/tubearchivist-${encodeHex('1001')}/${encodeHex('https://tube.example.test/user?name=a/b')}.json`
      )
      assert.strictEqual(
        userPath,
        `/cache/tubearchivist-${encodeHex('named-user')}/${encodeHex('https://tube.example.test/user?name=a/b')}.json`
      )
      assert.strictEqual(
        defaultPath,
        `/tmp/tubearchivist-${encodeHex('user')}/${encodeHex('https://tube.example.test/user?name=a/b')}.json`
      )
    })
  )

  it.effect('keeps URL and user-derived cache path components filename-safe', () =>
    Effect.gen(function* () {
      const path = yield* recordedReadPath({ TMPDIR: '/cache', USER: '../unsafe user/@host' })
      const components = path.split('/')
      const directory = components.at(-2)
      const filename = components.at(-1)

      assert.match(directory ?? '', /^tubearchivist-[0-9a-f]+$/u)
      assert.match(filename ?? '', /^[0-9a-f]+\.json$/u)
      assert.isFalse(path.includes('unsafe user'))
      assert.isFalse(path.includes('tube.example.test'))
    })
  )

  it.effect('returns Option.none for missing, malformed, and other failed reads', () => {
    const readWith = (readFileString: FileSystem.FileSystem['readFileString']) => {
      const fileSystemLayer = FileSystem.layerNoop({ readFileString })
      return provideCache(
        Effect.gen(function* () {
          const cache = yield* TubearchivistSessionCache
          return yield* cache.read('cache-key')
        }),
        { TMPDIR: '/cache', USER: 'reader' },
        fileSystemLayer
      )
    }

    return Effect.gen(function* () {
      const missing = yield* readWith(() => Effect.fail(fileError('NotFound', 'readFileString')))
      const malformed = yield* readWith(() => Effect.succeed('{not-json'))
      const denied = yield* readWith(() => Effect.fail(fileError('PermissionDenied', 'readFileString')))

      assert.deepStrictEqual(missing, Option.none())
      assert.deepStrictEqual(malformed, Option.none())
      assert.deepStrictEqual(denied, Option.none())
    })
  })

  it.effect('creates directories recursively with 0700 and writes files with 0600', () => {
    const directories: Array<{ readonly path: string; readonly options: unknown }> = []
    const writes: Array<{ readonly path: string; readonly data: string; readonly options: unknown }> = []
    const fileSystemLayer = FileSystem.layerNoop({
      makeDirectory: (path, options) => {
        directories.push({ options, path })
        return Effect.void
      },
      writeFileString: (path, data, options) => {
        writes.push({ data, options, path })
        return Effect.void
      },
    })

    return Effect.gen(function* () {
      const cache = yield* TubearchivistSessionCache
      yield* cache.write('https://tube.example.test', session)

      assert.deepStrictEqual(directories, [
        { options: { mode: 0o700, recursive: true }, path: `/cache/tubearchivist-${encodeHex('writer')}` },
      ])
      assert.deepStrictEqual(writes, [
        {
          data: '{"sessionId":"sid","csrfToken":"csrf"}',
          options: { mode: 0o600 },
          path: `/cache/tubearchivist-${encodeHex('writer')}/${encodeHex('https://tube.example.test')}.json`,
        },
      ])
    }).pipe((effect) => provideCache(effect, { TMPDIR: '/cache', USER: 'writer' }, fileSystemLayer))
  })

  it.effect('logs and ignores write failures', () => {
    const messages: Array<unknown> = []
    const logger = Logger.make((options) => {
      messages.push(options.message)
    })
    const fileSystemLayer = FileSystem.layerNoop({
      makeDirectory: () => Effect.fail(fileError('PermissionDenied', 'makeDirectory')),
    })

    return Effect.gen(function* () {
      const cache = yield* TubearchivistSessionCache
      yield* cache.write('cache-key', session)

      assert.isTrue(
        messages.some((message) =>
          Array.isArray(message)
            ? message.includes('session cache write failed')
            : message === 'session cache write failed'
        )
      )
    }).pipe(Effect.withLogger(logger), Effect.provideService(References.MinimumLogLevel, 'Debug'), (effect) =>
      provideCache(effect, { TMPDIR: '/cache', USER: 'writer' }, fileSystemLayer)
    )
  })

  it.effect('round-trips the serialized session on a real filesystem and always cleans up', () =>
    Effect.gen(function* () {
      const suffix = yield* Random.nextInt
      const root = `/tmp/garage-tubearchivist-cache-${suffix}`
      const env = { TMPDIR: root, UID: '4242', USER: 'ignored-user' }
      const layer = Layer.mergeAll(
        cacheLayer(BunFileSystem.layer),
        BunFileSystem.layer,
        BunPath.layer,
        configLayer(env)
      )

      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path
        const cache = yield* TubearchivistSessionCache
        const key = 'https://tube.example.test/user/admin'
        const expectedFile = path.join(root, `tubearchivist-${encodeHex('4242')}`, `${encodeHex(key)}.json`)

        yield* cache.write(key, session)
        assert.deepStrictEqual(yield* cache.read(key), Option.some(session))
        assert.strictEqual(yield* fs.readFileString(expectedFile, 'utf-8'), '{"sessionId":"sid","csrfToken":"csrf"}')
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            yield* fs.remove(root, { force: true, recursive: true })
          }).pipe(Effect.orDie)
        ),
        Effect.provide(layer)
      )
    })
  )
})
