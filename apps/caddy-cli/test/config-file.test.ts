import { assert, it } from '@effect/vitest'
import { FileSystem, Layer, Ref, Effect } from 'effect'

import { CaddyConfigFile, CaddyConfigFileLive } from '../src/config-file.js'

it.effect('CaddyConfigFileLive reads JSON through the FileSystem service', () =>
  Effect.gen(function* () {
    const reads = yield* Ref.make<ReadonlyArray<string>>([])
    const FileSystemLayer = FileSystem.layerNoop({
      readFileString: (path) =>
        Ref.update(reads, (records) => [...records, path]).pipe(Effect.as('{"apps":{"http":{"servers":{}}}}')),
    })
    const layer = CaddyConfigFileLive.pipe(Layer.provide(FileSystemLayer))
    const config = yield* Effect.gen(function* () {
      const configFile = yield* CaddyConfigFile
      return yield* configFile.read('next.json')
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(config, { apps: { http: { servers: {} } } })
    assert.deepStrictEqual(yield* Ref.get(reads), ['next.json'])
  })
)
