import { assert, it as effectIt } from '@effect/vitest'
import { Effect, FileSystem, Layer, Path, Ref, Sink, Stream } from 'effect'
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

  it('bumps a CLI when its app changes', () => {
    expect(affectedCliPackages(['apps/adguard-cli/src/index.ts'], cliNames)).toEqual(['@garage/adguard-cli'])
  })

  it('bumps a CLI when its backing package changes', () => {
    expect(affectedCliPackages(['packages/sonarr/src/operations.ts'], cliNames)).toEqual(['@garage/sonarr-cli'])
  })

  it('bumps every CLI when the shared protocol changes', () => {
    expect(affectedCliPackages(['packages/cli-protocol/src/index.ts'], cliNames)).toEqual([
      '@garage/adguard-cli',
      '@garage/sonarr-cli',
    ])
  })

  it('deduplicates packages affected through multiple paths', () => {
    expect(
      affectedCliPackages(['apps/adguard-cli/src/index.ts', 'packages/adguard/src/operations.ts'], cliNames)
    ).toEqual(['@garage/adguard-cli'])
  })

  it('does not bump CLIs for unrelated changes', () => {
    expect(affectedCliPackages(['README.md', 'packages/unknown/src/index.ts'], cliNames)).toEqual([])
  })
})

describe('changesetMarkdown', () => {
  it('writes patch bumps for each affected CLI package', () => {
    expect(changesetMarkdown(['@garage/adguard-cli', '@garage/sonarr-cli'])).toBe(`---
"@garage/adguard-cli": patch
"@garage/sonarr-cli": patch
---

Automatic CLI release for changed app or package code.
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
