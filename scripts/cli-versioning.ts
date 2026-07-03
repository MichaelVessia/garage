import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Arr from 'effect/Array'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type * as PlatformError from 'effect/PlatformError'
import * as Stream from 'effect/Stream'
import * as Str from 'effect/String'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

import { CliVersioningError } from './errors'

const garagePackagePrefix = '@garage/'
const cliSuffix = '-cli'

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const cliPackageName = (cliName: string): string => `${garagePackagePrefix}${cliName}${cliSuffix}`

export const affectedCliPackages = (changedFiles: readonly string[], cliNames: readonly string[]): string[] => {
  const normalizedFiles = Arr.map(changedFiles, (changedFile) => changedFile.replaceAll('\\', '/'))
  const protocolChanged = Arr.some(normalizedFiles, (file) => file.startsWith('packages/cli-protocol/'))

  const affectedCliNames = Arr.filter(cliNames, (cliName) => {
    const matchesCli = Arr.some(
      normalizedFiles,
      (file) => file.startsWith(`apps/${cliName}${cliSuffix}/`) || file.startsWith(`packages/${cliName}/`)
    )

    return protocolChanged || matchesCli
  })

  return Arr.map(affectedCliNames, cliPackageName)
}

export const changesetMarkdown = (packageNames: readonly string[]): string => {
  const packageLines = packageNames.map((packageName) => `"${packageName}": patch`)

  return ['---', ...packageLines, '---', '', 'Automatic CLI release for changed app or package code.', ''].join('\n')
}

const platformError = (operation: string, cause: PlatformError.PlatformError): CliVersioningError =>
  new CliVersioningError({ message: `${operation}: ${cause.message}` })

const streamText = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>
): Effect.Effect<string, PlatformError.PlatformError> => Stream.mkString(Stream.decodeText(stream))

const commandText = (command: string, args: readonly string[]): string => `${command} ${args.join(' ')}`

const commandOutput = (result: CommandResult): string => {
  const stderr = result.stderr.trim()
  const stdout = result.stdout.trim()
  return Str.isNonEmpty(stderr) ? stderr : stdout
}

const runCommand = Effect.fn('cli-versioning.runCommand')(function* (command: string, args: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner
        .spawn(ChildProcess.make(command, args))
        .pipe(Effect.mapError((cause) => platformError(`Could not start ${commandText(command, args)}`, cause)))
      const result = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: streamText(handle.stdout),
          stderr: streamText(handle.stderr),
        },
        { concurrency: 'unbounded' }
      ).pipe(Effect.mapError((cause) => platformError(`Could not read ${commandText(command, args)} output`, cause)))
      const { exitCode, stdout, stderr } = result
      const exitCodeNumber: number = exitCode

      return { exitCode: exitCodeNumber, stdout, stderr }
    })
  )
})

const discoverCliNames = Effect.fn('cli-versioning.discoverCliNames')(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directoryNames = yield* fs
    .readDirectory('apps')
    .pipe(Effect.mapError((cause) => platformError('Could not read apps directory', cause)))

  const cliCandidates = Arr.filter(directoryNames, (directoryName) => directoryName.endsWith(cliSuffix))
  const cliNameOptions = yield* Effect.forEach(
    cliCandidates,
    (directoryName) =>
      Effect.gen(function* () {
        const packageJsonPath = path.join('apps', directoryName, 'package.json')
        const hasPackageJson = yield* fs
          .exists(packageJsonPath)
          .pipe(Effect.mapError((cause) => platformError(`Could not inspect ${packageJsonPath}`, cause)))

        return hasPackageJson ? Option.some(directoryName.slice(0, -cliSuffix.length)) : Option.none<string>()
      }),
    { concurrency: 'unbounded' }
  )

  return Arr.getSomes(cliNameOptions).toSorted()
})

const changedFilesBetween = Effect.fn('cli-versioning.changedFilesBetween')(function* (
  baseRef: string,
  headRef: string
) {
  const result = yield* runCommand('git', ['diff', '--name-only', `${baseRef}...${headRef}`])

  if (result.exitCode !== 0) {
    return yield* Effect.fail(new CliVersioningError({ message: `git diff failed: ${commandOutput(result)}` }))
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Str.isNonEmpty(line))
})

const writeAutomaticChangeset = Effect.fn('cli-versioning.writeAutomaticChangeset')(function* (
  packageNames: readonly string[]
) {
  if (Arr.isReadonlyArrayEmpty(packageNames)) {
    return
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fs
    .makeDirectory('.changeset', { recursive: true })
    .pipe(Effect.mapError((cause) => platformError('Could not create .changeset directory', cause)))
  yield* fs
    .writeFileString(path.join('.changeset', 'automatic-cli-release.md'), changesetMarkdown(packageNames))
    .pipe(Effect.mapError((cause) => platformError('Could not write automatic CLI changeset', cause)))
})

const writePackageOutput = Effect.fn('cli-versioning.writePackageOutput')(function* (
  packageOutputPath: string,
  packageNames: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const packageOutputDirectory = path.dirname(packageOutputPath)

  if (packageOutputDirectory !== '.') {
    yield* fs
      .makeDirectory(packageOutputDirectory, { recursive: true })
      .pipe(Effect.mapError((cause) => platformError(`Could not create ${packageOutputDirectory}`, cause)))
  }

  yield* fs
    .writeFileString(packageOutputPath, Arr.isReadonlyArrayEmpty(packageNames) ? '' : `${packageNames.join('\n')}\n`)
    .pipe(Effect.mapError((cause) => platformError(`Could not write ${packageOutputPath}`, cause)))
})

const readPackageOutput = Effect.fn('cli-versioning.readPackageOutput')(function* (packageOutputPath: string) {
  const fs = yield* FileSystem.FileSystem
  const content = yield* fs
    .readFileString(packageOutputPath)
    .pipe(Effect.mapError((cause) => platformError(`Could not read ${packageOutputPath}`, cause)))

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Str.isNonEmpty(line))
})

const cliDirectoryNameFromPackage = (packageName: string): Effect.Effect<string, CliVersioningError> => {
  if (!packageName.startsWith(garagePackagePrefix) || !packageName.endsWith(cliSuffix)) {
    return Effect.fail(new CliVersioningError({ message: `Unsupported CLI package name: ${packageName}` }))
  }

  return Effect.succeed(packageName.slice(garagePackagePrefix.length))
}

const packageVersion = Effect.fn('cli-versioning.packageVersion')(function* (packageName: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directoryName = yield* cliDirectoryNameFromPackage(packageName)
  const packageJsonPath = path.join('apps', directoryName, 'package.json')
  const packageJson = yield* fs
    .readFileString(packageJsonPath)
    .pipe(Effect.mapError((cause) => platformError(`Could not read ${packageJsonPath}`, cause)))
  const match = /"version"\s*:\s*"([^"]+)"/u.exec(packageJson)
  const version = Option.fromUndefinedOr(match?.[1])

  return yield* Option.match(version, {
    onNone: () => Effect.fail(new CliVersioningError({ message: `Could not find version for ${packageName}` })),
    onSome: (value) => Effect.succeed(value),
  })
})

const gitTagExists = Effect.fn('cli-versioning.gitTagExists')(function* (tagName: string) {
  const result = yield* runCommand('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tagName}`])

  return result.exitCode === 0
})

const createGitTag = Effect.fn('cli-versioning.createGitTag')(function* (tagName: string) {
  const result = yield* runCommand('git', ['tag', tagName])

  if (result.exitCode !== 0) {
    yield* Effect.fail(new CliVersioningError({ message: `git tag failed for ${tagName}: ${commandOutput(result)}` }))
  }
})

const tagReleasedPackages = Effect.fn('cli-versioning.tagReleasedPackages')(function* (
  packageNames: readonly string[]
) {
  yield* Effect.forEach(
    packageNames,
    (packageName) =>
      Effect.gen(function* () {
        const directoryName = yield* cliDirectoryNameFromPackage(packageName)
        const version = yield* packageVersion(packageName)
        const tagName = `${directoryName}-v${version}`

        if (!(yield* gitTagExists(tagName))) {
          yield* createGitTag(tagName)
        }
      }),
    { concurrency: 1 }
  )
})

const valueAfter = (args: readonly string[], flag: string): Option.Option<string> => {
  const flagIndex = args.indexOf(flag)

  if (flagIndex === -1) {
    return Option.none()
  }

  return Option.fromUndefinedOr(args[flagIndex + 1])
}

const usage = `Usage:
  bun scripts/cli-versioning.ts write --base <ref> --head <ref> --package-output <path>
  bun scripts/cli-versioning.ts tag --package-output <path>
`

const writeCommand = Effect.fn('cli-versioning.writeCommand')(function* (args: readonly string[]) {
  const options = Option.all({
    baseRef: valueAfter(args, '--base'),
    headRef: valueAfter(args, '--head'),
    packageOutputPath: valueAfter(args, '--package-output'),
  })

  const { baseRef, headRef, packageOutputPath } = yield* Option.match(options, {
    onNone: () => Effect.fail(new CliVersioningError({ message: usage })),
    onSome: (values) => Effect.succeed(values),
  })

  const changedFiles = yield* changedFilesBetween(baseRef, headRef)
  const cliNames = yield* discoverCliNames()
  const packageNames = affectedCliPackages(changedFiles, cliNames)
  yield* writeAutomaticChangeset(packageNames)
  yield* writePackageOutput(packageOutputPath, packageNames)
})

const tagCommand = Effect.fn('cli-versioning.tagCommand')(function* (args: readonly string[]) {
  const packageOutputPath = yield* Option.match(valueAfter(args, '--package-output'), {
    onNone: () => Effect.fail(new CliVersioningError({ message: usage })),
    onSome: (value) => Effect.succeed(value),
  })

  const packageNames = yield* readPackageOutput(packageOutputPath)
  yield* tagReleasedPackages(packageNames)
})

export const runCliVersioning = Effect.fn('cli-versioning.runCliVersioning')(function* (args: readonly string[]) {
  const [command] = args

  if (command === 'write') {
    yield* writeCommand(args)
    return
  }

  if (command === 'tag') {
    yield* tagCommand(args)
    return
  }

  yield* Effect.fail(new CliVersioningError({ message: usage }))
})

const reportCliVersioningFailure = Effect.fn('cli-versioning.runCliVersioning.onFailure')(function* (
  failure: CliVersioningError
) {
  yield* Console.error(failure.message)
  return yield* Effect.fail(failure)
})

if (import.meta.main) {
  const program = runCliVersioning(Bun.argv.slice(2)).pipe(
    Effect.matchEffect({
      onFailure: reportCliVersioningFailure,
      onSuccess: () => Effect.void,
    }),
    Effect.provide(BunServices.layer)
  )

  BunRuntime.runMain(program, { disableErrorReporting: true })
}
