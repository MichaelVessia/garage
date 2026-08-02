import { assert, it as effectIt } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Sink from 'effect/Sink'
import * as Stream from 'effect/Stream'
import type { ChildProcess } from 'effect/unstable/process'
import { ChildProcessSpawner } from 'effect/unstable/process'
import { describe, expect, it } from 'vitest'

import { affectedCliPackages, changesetMarkdown, runCliVersioning } from './cli-versioning'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

const output = (text: string) => Stream.make(bytes(text))

const handle = (exitCode: number, stdout: string, stderr: string) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: output(stdout),
    stderr: output(stderr),
    all: output(`${stdout}${stderr}`),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  })

const commandLine = (command: ChildProcess.Command): string =>
  command._tag === 'StandardCommand' ? [command.command, ...command.args].join(' ') : 'piped command'

describe('affectedCliPackages', () => {
  const cliNames = ['adguard', 'sonarr']
  const allCliPackages = ['@garage/adguard-cli', '@garage/sonarr-cli']

  it.each([
    ['paired CLI app', ['apps/adguard-cli/src/index.ts'], ['@garage/adguard-cli']],
    ['paired integration package', ['packages/sonarr/src/operations.ts'], ['@garage/sonarr-cli']],
    ['shared CLI protocol', ['packages/cli-protocol/src/index.ts'], allCliPackages],
    ['root package manifest', ['package.json'], allCliPackages],
    ['Bun lockfile', ['bun.lock'], allCliPackages],
    ['Nix Bun dependency graph', ['bun.nix'], allCliPackages],
    ['Nix flake', ['flake.nix'], allCliPackages],
    ['Nix flake lockfile', ['flake.lock'], allCliPackages],
    ['shared TypeScript configuration', ['tsconfig.base.json'], allCliPackages],
    ['repository documentation', ['README.md'], []],
    ['workspace test', ['packages/adguard/test/operations.test.ts'], []],
    ['shared protocol test', ['packages/cli-protocol/test/envelope.test.ts'], []],
    ['workspace documentation', ['packages/adguard/docs/configuration.ts'], []],
    ['unrelated package', ['packages/unknown/src/index.ts'], []],
    ['Subq-only code', ['apps/subq/src/worker.ts'], []],
  ])('classifies %s changes', (_pathClass, changedFiles, expectedPackages) => {
    expect(affectedCliPackages(changedFiles, cliNames)).toEqual(expectedPackages)
  })

  it('normalizes Windows path separators', () => {
    expect(affectedCliPackages(['apps\\adguard-cli\\src\\index.ts'], cliNames)).toEqual(['@garage/adguard-cli'])
  })

  it('deduplicates packages affected through multiple paths', () => {
    expect(
      affectedCliPackages(['apps/adguard-cli/src/index.ts', 'packages/adguard/src/operations.ts'], cliNames)
    ).toEqual(['@garage/adguard-cli'])
  })

  it('lets global artifact inputs override otherwise unrelated changes', () => {
    expect(affectedCliPackages(['apps/subq/src/worker.ts', 'bun.lock'], cliNames)).toEqual(allCliPackages)
  })
})

describe('changesetMarkdown', () => {
  it('writes patch bumps for each affected CLI package', () => {
    expect(changesetMarkdown(['@garage/adguard-cli', '@garage/sonarr-cli'])).toBe(`---
"@garage/adguard-cli": patch
"@garage/sonarr-cli": patch
---

Automatic CLI release for changed artifact inputs.
`)
  })
})

effectIt.effect('write command discovers affected CLIs with Effect platform services', () =>
  Effect.gen(function* () {
    const directories = yield* Ref.make<ReadonlyArray<string>>([])
    const writes = yield* Ref.make<ReadonlyArray<{ readonly path: string; readonly data: string }>>([])
    const FileSystemLayer = FileSystem.layerNoop({
      readDirectory: (path) => (path === 'apps' ? Effect.succeed(['adguard-cli', 'sonarr-cli']) : Effect.succeed([])),
      exists: (path) =>
        Effect.succeed(path === 'apps/adguard-cli/package.json' || path === 'apps/sonarr-cli/package.json'),
      makeDirectory: (path) => Ref.update(directories, (records) => [...records, path]),
      writeFileString: (path, data) => Ref.update(writes, (records) => [...records, { path, data }]),
    })
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.succeed(
        commandLine(command) === 'git diff --name-only main...HEAD'
          ? handle(0, 'apps/adguard-cli/src/index.ts\nREADME.md\n', '')
          : handle(1, '', `unexpected ${commandLine(command)}`)
      )
    )
    const layer = Layer.mergeAll(
      FileSystemLayer,
      Path.layer,
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
    )

    yield* runCliVersioning(['write', '--base', 'main', '--head', 'HEAD', '--package-output', 'tmp/packages.txt']).pipe(
      Effect.provide(layer)
    )

    assert.deepStrictEqual(yield* Ref.get(directories), ['.changeset', 'tmp'])
    assert.deepStrictEqual(yield* Ref.get(writes), [
      {
        path: '.changeset/automatic-cli-release.md',
        data: changesetMarkdown(['@garage/adguard-cli']),
      },
      { path: 'tmp/packages.txt', data: '@garage/adguard-cli\n' },
    ])
  })
)

effectIt.effect('tag command creates missing package tags with Effect platform services', () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([])
    const FileSystemLayer = FileSystem.layerNoop({
      readFileString: (path) => {
        if (path === 'tmp/packages.txt') {
          return Effect.succeed('@garage/adguard-cli\n')
        }

        if (path === 'apps/adguard-cli/package.json') {
          return Effect.succeed('{"version":"0.2.0"}')
        }

        return Effect.succeed('')
      },
    })
    const spawner = ChildProcessSpawner.make((command) => {
      const line = commandLine(command)
      return Ref.update(calls, (records) => [...records, line]).pipe(
        Effect.as(
          line === 'git rev-parse --quiet --verify refs/tags/adguard-cli-v0.2.0' ? handle(1, '', '') : handle(0, '', '')
        )
      )
    })
    const layer = Layer.mergeAll(
      FileSystemLayer,
      Path.layer,
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
    )

    yield* runCliVersioning(['tag', '--package-output', 'tmp/packages.txt']).pipe(Effect.provide(layer))

    assert.deepStrictEqual(yield* Ref.get(calls), [
      'git rev-parse --quiet --verify refs/tags/adguard-cli-v0.2.0',
      'git tag adguard-cli-v0.2.0',
    ])
  })
)
