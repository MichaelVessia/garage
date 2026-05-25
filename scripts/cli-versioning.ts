import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import { Console, Effect, FileSystem, Path, Stream } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

const garagePackagePrefix = '@garage/'
const cliSuffix = '-cli'

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const cliPackageName = (cliName: string): string => `${garagePackagePrefix}${cliName}${cliSuffix}`

export const affectedCliPackages = (changedFiles: readonly string[], cliNames: readonly string[]): string[] => {
  const affected = new Set<string>()

  for (const changedFile of changedFiles) {
    const normalizedFile = changedFile.replaceAll('\\', '/')

    if (normalizedFile.startsWith('packages/cli-protocol/')) {
      for (const cliName of cliNames) {
        affected.add(cliPackageName(cliName))
      }
      continue
    }

    for (const cliName of cliNames) {
      if (normalizedFile.startsWith(`apps/${cliName}${cliSuffix}/`)) {
        affected.add(cliPackageName(cliName))
      }

      if (normalizedFile.startsWith(`packages/${cliName}/`)) {
        affected.add(cliPackageName(cliName))
      }
    }
  }

  return cliNames.map(cliPackageName).filter((packageName) => affected.has(packageName))
}

export const changesetMarkdown = (packageNames: readonly string[]): string => {
  const packageLines = packageNames.map((packageName) => `"${packageName}": patch`)

  return ['---', ...packageLines, '---', '', 'Automatic CLI release for changed app or package code.', ''].join('\n')
}

const platformError = (operation: string, cause: PlatformError.PlatformError): Error =>
  new Error(`${operation}: ${cause.message}`)

const streamText = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>
): Effect.Effect<string, PlatformError.PlatformError> => Stream.mkString(Stream.decodeText(stream))

const commandText = (command: string, args: readonly string[]): string => `${command} ${args.join(' ')}`

const commandOutput = (result: CommandResult): string => {
  const stderr = result.stderr.trim()
  const stdout = result.stdout.trim()
  return stderr.length === 0 ? stdout : stderr
}

const runCommand = Effect.fn('runCommand')(function* (command: string, args: readonly string[]) {
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

const discoverCliNames = Effect.fn('discoverCliNames')(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directoryNames = yield* fs
    .readDirectory('apps')
    .pipe(Effect.mapError((cause) => platformError('Could not read apps directory', cause)))
  const cliNames: string[] = []

  for (const directoryName of directoryNames) {
    if (!directoryName.endsWith(cliSuffix)) {
      continue
    }

    const packageJsonPath = path.join('apps', directoryName, 'package.json')
    const hasPackageJson = yield* fs
      .exists(packageJsonPath)
      .pipe(Effect.mapError((cause) => platformError(`Could not inspect ${packageJsonPath}`, cause)))

    if (hasPackageJson) {
      cliNames.push(directoryName.slice(0, -cliSuffix.length))
    }
  }

  return cliNames.toSorted()
})

const changedFilesBetween = Effect.fn('changedFilesBetween')(function* (baseRef: string, headRef: string) {
  const result = yield* runCommand('git', ['diff', '--name-only', `${baseRef}...${headRef}`])

  if (result.exitCode !== 0) {
    return yield* Effect.fail(new Error(`git diff failed: ${commandOutput(result)}`))
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
})

const writeAutomaticChangeset = Effect.fn('writeAutomaticChangeset')(function* (packageNames: readonly string[]) {
  if (packageNames.length === 0) {
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

const writePackageOutput = Effect.fn('writePackageOutput')(function* (
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
    .writeFileString(packageOutputPath, packageNames.length === 0 ? '' : `${packageNames.join('\n')}\n`)
    .pipe(Effect.mapError((cause) => platformError(`Could not write ${packageOutputPath}`, cause)))
})

const readPackageOutput = Effect.fn('readPackageOutput')(function* (packageOutputPath: string) {
  const fs = yield* FileSystem.FileSystem
  const content = yield* fs
    .readFileString(packageOutputPath)
    .pipe(Effect.mapError((cause) => platformError(`Could not read ${packageOutputPath}`, cause)))

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
})

const cliDirectoryNameFromPackage = (packageName: string): Effect.Effect<string, Error> => {
  if (!packageName.startsWith(garagePackagePrefix) || !packageName.endsWith(cliSuffix)) {
    return Effect.fail(new Error(`Unsupported CLI package name: ${packageName}`))
  }

  return Effect.succeed(packageName.slice(garagePackagePrefix.length))
}

const packageVersion = Effect.fn('packageVersion')(function* (packageName: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directoryName = yield* cliDirectoryNameFromPackage(packageName)
  const packageJsonPath = path.join('apps', directoryName, 'package.json')
  const packageJson = yield* fs
    .readFileString(packageJsonPath)
    .pipe(Effect.mapError((cause) => platformError(`Could not read ${packageJsonPath}`, cause)))
  const match = /"version"\s*:\s*"([^"]+)"/u.exec(packageJson)
  const version = match?.[1]

  if (version === undefined) {
    return yield* Effect.fail(new Error(`Could not find version for ${packageName}`))
  }

  return version
})

const gitTagExists = Effect.fn('gitTagExists')(function* (tagName: string) {
  const result = yield* runCommand('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tagName}`])

  return result.exitCode === 0
})

const createGitTag = Effect.fn('createGitTag')(function* (tagName: string) {
  const result = yield* runCommand('git', ['tag', tagName])

  if (result.exitCode !== 0) {
    return yield* Effect.fail(new Error(`git tag failed for ${tagName}: ${commandOutput(result)}`))
  }
})

const tagReleasedPackages = Effect.fn('tagReleasedPackages')(function* (packageNames: readonly string[]) {
  for (const packageName of packageNames) {
    const directoryName = yield* cliDirectoryNameFromPackage(packageName)
    const version = yield* packageVersion(packageName)
    const tagName = `${directoryName}-v${version}`

    if (!(yield* gitTagExists(tagName))) {
      yield* createGitTag(tagName)
    }
  }
})

const valueAfter = (args: readonly string[], flag: string): string | undefined => {
  const flagIndex = args.indexOf(flag)

  if (flagIndex === -1) {
    return undefined
  }

  return args[flagIndex + 1]
}

const usage = `Usage:
  bun scripts/cli-versioning.ts write --base <ref> --head <ref> --package-output <path>
  bun scripts/cli-versioning.ts tag --package-output <path>
`

const writeCommand = Effect.fn('writeCommand')(function* (args: readonly string[]) {
  const baseRef = valueAfter(args, '--base')
  const headRef = valueAfter(args, '--head')
  const packageOutputPath = valueAfter(args, '--package-output')

  if (baseRef === undefined || headRef === undefined || packageOutputPath === undefined) {
    return yield* Effect.fail(new Error(usage))
  }

  const changedFiles = yield* changedFilesBetween(baseRef, headRef)
  const cliNames = yield* discoverCliNames()
  const packageNames = affectedCliPackages(changedFiles, cliNames)
  yield* writeAutomaticChangeset(packageNames)
  yield* writePackageOutput(packageOutputPath, packageNames)
})

const tagCommand = Effect.fn('tagCommand')(function* (args: readonly string[]) {
  const packageOutputPath = valueAfter(args, '--package-output')

  if (packageOutputPath === undefined) {
    return yield* Effect.fail(new Error(usage))
  }

  const packageNames = yield* readPackageOutput(packageOutputPath)
  yield* tagReleasedPackages(packageNames)
})

export const runCliVersioning = Effect.fn('runCliVersioning')(function* (args: readonly string[]) {
  const [command] = args

  if (command === 'write') {
    yield* writeCommand(args)
    return
  }

  if (command === 'tag') {
    yield* tagCommand(args)
    return
  }

  return yield* Effect.fail(new Error(usage))
})

if (import.meta.main) {
  const program = runCliVersioning(Bun.argv.slice(2)).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          yield* Console.error(error.message)
          return yield* Effect.fail(error)
        }),
      onSuccess: () => Effect.void,
    }),
    Effect.provide(BunServices.layer)
  )

  BunRuntime.runMain(program, { disableErrorReporting: true })
}
