import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { describe } from 'vitest'

const cliEntrypoints = Effect.fn('cli-entrypoints.cliEntrypoints')(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const entries = yield* fs.readDirectory('apps')
  const candidates = Arr.filter(entries, (entry) => entry.endsWith('-cli'))
  const maybePaths = yield* Effect.forEach(
    candidates,
    (entry) =>
      Effect.gen(function* () {
        const entrypoint = path.join('apps', entry, 'src', 'main.ts')
        const present = yield* fs.exists(entrypoint)
        return present ? Option.some(entrypoint) : Option.none<string>()
      }),
    { concurrency: 'unbounded' }
  )

  return Arr.getSomes(maybePaths)
})

describe('CLI entrypoints', () => {
  it.effect('run main programs through the Bun Effect runtime', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const entrypoints = yield* cliEntrypoints()

      assert.isTrue(Arr.isReadonlyArrayNonEmpty(entrypoints))

      yield* Effect.forEach(
        entrypoints,
        (entrypoint) =>
          Effect.gen(function* () {
            const source = yield* fs.readFileString(entrypoint)

            assert.match(
              source,
              /import\s+\{[^}]*\bBunRuntime\b[^}]*\}\s+from\s+'@effect\/platform-bun'/su,
              `${entrypoint} should import BunRuntime`
            )
            assert.include(source, 'BunRuntime.runMain(program)', `${entrypoint} should use BunRuntime.runMain`)
            assert.notInclude(source, 'Effect.runPromise(program)', `${entrypoint} should not bypass the runtime`)
          }),
        { concurrency: 'unbounded' }
      )
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.effect('keep Effect layer diagnostics enabled in main programs', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const entrypoints = yield* cliEntrypoints()

      assert.isTrue(Arr.isReadonlyArrayNonEmpty(entrypoints))

      yield* Effect.forEach(
        entrypoints,
        (entrypoint) =>
          Effect.gen(function* () {
            const source = yield* fs.readFileString(entrypoint)

            assert.notInclude(source, 'strictEffectProvide', `${entrypoint} should not suppress strictEffectProvide`)
            assert.notInclude(
              source,
              'Effect.provide(Live)',
              `${entrypoint} should not provide the Live layer directly`
            )
            assert.notMatch(
              source,
              /Layer\.provideMerge\([^)]*Bun(?:FileSystem|HttpClient|Path|Services)\.layer/su,
              `${entrypoint} should hide platform layers from provideMerge`
            )
          }),
        { concurrency: 'unbounded' }
      )
    }).pipe(Effect.provide(BunServices.layer))
  )
})
