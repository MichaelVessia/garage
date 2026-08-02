import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import { describe } from 'vitest'

const effectBeta = '4.0.0-beta.93'

const DependencyMap = Schema.Record(Schema.String, Schema.String)
const Manifest = Schema.Struct({
  dependencies: Schema.optional(DependencyMap),
  devDependencies: Schema.optional(DependencyMap),
})

const discoverManifests = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const workspaceDirectories = yield* Effect.forEach(['apps', 'packages'], (root) =>
    fs.readDirectory(root).pipe(Effect.map((entries) => Arr.map(entries, (entry) => path.join(root, entry))))
  )
  const candidates = [
    'package.json',
    ...Arr.flatten(workspaceDirectories).map((entry) => path.join(entry, 'package.json')),
  ]
  const manifests = yield* Effect.forEach(
    candidates,
    (candidate) => fs.exists(candidate).pipe(Effect.map((exists) => (exists ? Option.some(candidate) : Option.none()))),
    { concurrency: 'unbounded' }
  )

  return Arr.getSomes(manifests)
})

const isPinnedEffectDependency = (name: string): boolean =>
  name === 'effect' ||
  name === '@effect/vitest' ||
  name === '@effect/platform' ||
  name.startsWith('@effect/platform-') ||
  name === '@effect/sql' ||
  name.startsWith('@effect/sql-')

describe('Effect dependency pins', () => {
  it.effect('exact-pins first-party runtime and test packages to one beta', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const paths = yield* discoverManifests
      const mismatches = yield* Effect.forEach(
        paths,
        (path) =>
          fs.readFileString(path).pipe(
            Effect.map((source) => Schema.decodeUnknownSync(Manifest)(JSON.parse(source))),
            Effect.map((manifest) => ({ ...manifest.dependencies, ...manifest.devDependencies })),
            Effect.map(R.toEntries),
            Effect.map((dependencies) =>
              Arr.filter(dependencies, ([name, version]) => isPinnedEffectDependency(name) && version !== effectBeta)
            ),
            Effect.map((dependencies) => Arr.map(dependencies, ([name, version]) => `${path}: ${name}=${version}`))
          ),
        { concurrency: 'unbounded' }
      )

      assert.deepStrictEqual(Arr.flatten(mismatches), [])
    }).pipe(Effect.provide(BunServices.layer))
  )
})
