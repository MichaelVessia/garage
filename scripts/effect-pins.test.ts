import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { describe } from 'vitest'

const effectVersion = '4.1.5'
const nestedAppWorkspaces = ['domain', 'server', 'web']

const DependencyMap = Schema.Record(Schema.String, Schema.String)

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    dependencies: Schema.optional(DependencyMap),
    devDependencies: Schema.optional(DependencyMap),
    overrides: Schema.optional(DependencyMap),
  })
)

const discoverManifests = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const existingRoots = yield* Effect.forEach(
    ['apps', 'packages'],
    (root) => fs.exists(root).pipe(Effect.map((exists) => (exists ? Option.some(root) : Option.none()))),
    { concurrency: 'unbounded' }
  ).pipe(Effect.map(Arr.getSomes))

  const workspaceManifests = yield* Effect.forEach(
    existingRoots,
    (root) =>
      fs.readDirectory(root).pipe(
        Effect.map((entries) =>
          Arr.flatMap(entries, (entry) => {
            const manifest = path.join(root, entry, 'package.json')

            return root === 'apps'
              ? [
                  manifest,
                  ...Arr.map(nestedAppWorkspaces, (workspace) => path.join(root, entry, workspace, 'package.json')),
                ]
              : [manifest]
          })
        )
      ),
    { concurrency: 'unbounded' }
  )

  const candidates = ['package.json', ...Arr.flatten(workspaceManifests)]

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
  Str.startsWith('@effect/platform-')(name) ||
  name === '@effect/sql' ||
  Str.startsWith('@effect/sql-')(name)

describe('Effect dependency pins', () => {
  it.effect('exact-pins first-party runtime and test packages to one version', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const paths = yield* discoverManifests

      const mismatches = yield* Effect.forEach(
        paths,
        (path) =>
          fs.readFileString(path).pipe(
            Effect.flatMap(Schema.decodeEffect(Manifest)),
            Effect.map((manifest) => [
              ...R.toEntries(manifest.dependencies ?? {}),
              ...R.toEntries(manifest.devDependencies ?? {}),
              ...R.toEntries(manifest.overrides ?? {}),
            ]),
            Effect.map((dependencies) =>
              Arr.filter(dependencies, ([name, version]) => isPinnedEffectDependency(name) && version !== effectVersion)
            ),
            Effect.map((dependencies) => Arr.map(dependencies, ([name, version]) => `${path}: ${name}=${version}`))
          ),
        { concurrency: 'unbounded' }
      )

      assert.deepStrictEqual(Arr.flatten(mismatches), [])
    }).pipe(Effect.provide(BunServices.layer))
  )
})
