import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as PlatformError from 'effect/PlatformError'
import * as Ref from 'effect/Ref'

import { readCaddyConfigFile } from '../src/config-file.js'

const makeRecordingFileSystem = (read: (path: string) => Effect.Effect<string, PlatformError.PlatformError>) =>
  Effect.gen(function* () {
    const reads = yield* Ref.make<ReadonlyArray<string>>([])
    const layer = FileSystem.layerNoop({
      readFileString: (path) => Ref.update(reads, (records) => [...records, path]).pipe(Effect.andThen(read(path))),
    })
    return { layer, reads }
  })

const assertDecodeError = (error: {
  readonly _tag: string
  readonly code: string
  readonly fix: string
  readonly message: string
}): void => {
  assert.strictEqual(error._tag, 'CaddyDecodeError')
  assert.strictEqual(error.code, 'CADDY_DECODE_ERROR')
  assert.strictEqual(error.fix, 'Update the Caddy schemas to match the API response shape.')
}

describe('readCaddyConfigFile', () => {
  it.effect('reads and decodes a JSON object through FileSystem', () =>
    Effect.gen(function* () {
      const fs = yield* makeRecordingFileSystem(() => Effect.succeed('{"apps":{"http":{"servers":{}}}}'))
      const config = yield* readCaddyConfigFile('next.json').pipe(Effect.provide(fs.layer))

      assert.deepStrictEqual(config, { apps: { http: { servers: {} } } })
      assert.deepStrictEqual(yield* Ref.get(fs.reads), ['next.json'])
    })
  )

  it.effect('maps read failures to the existing decode error with the requested path', () =>
    Effect.gen(function* () {
      const fs = yield* makeRecordingFileSystem((path) =>
        Effect.fail(
          PlatformError.systemError({
            _tag: 'NotFound',
            module: 'test',
            method: 'readFileString',
            pathOrDescriptor: path,
          })
        )
      )
      const error = yield* readCaddyConfigFile('/missing/next.json').pipe(Effect.provide(fs.layer), Effect.flip)

      assertDecodeError(error)
      assert.match(error.message, /Could not read Caddy config file \/missing\/next\.json/u)
      assert.match(error.message, /NotFound/u)
      assert.deepStrictEqual(yield* Ref.get(fs.reads), ['/missing/next.json'])
    })
  )

  it.effect('rejects malformed JSON with the existing decode error semantics', () =>
    Effect.gen(function* () {
      const fs = yield* makeRecordingFileSystem(() => Effect.succeed('{"apps":'))
      const error = yield* readCaddyConfigFile('malformed.json').pipe(Effect.provide(fs.layer), Effect.flip)

      assertDecodeError(error)
      assert.notStrictEqual(error.message, '')
    })
  )

  it.effect('rejects non-object JSON with the existing decode error semantics', () =>
    Effect.gen(function* () {
      const fs = yield* makeRecordingFileSystem(() => Effect.succeed('["not-an-object"]'))
      const error = yield* readCaddyConfigFile('array.json').pipe(Effect.provide(fs.layer), Effect.flip)

      assertDecodeError(error)
      assert.notStrictEqual(error.message, '')
    })
  )
})
