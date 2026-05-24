import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const garagePackagePrefix = '@garage/'
const cliSuffix = '-cli'

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

const discoverCliNames = (): string[] =>
  readdirSync('apps', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((directoryName) => directoryName.endsWith(cliSuffix))
    .filter((directoryName) => existsSync(join('apps', directoryName, 'package.json')))
    .map((directoryName) => directoryName.slice(0, -cliSuffix.length))
    .sort()

const changedFilesBetween = (baseRef: string, headRef: string): string[] => {
  const result = spawnSync('git', ['diff', '--name-only', `${baseRef}...${headRef}`], { encoding: 'utf-8' })

  if (result.status !== 0) {
    throw new Error(`git diff failed: ${result.stderr.trim()}`)
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const writeAutomaticChangeset = (packageNames: readonly string[]): void => {
  if (packageNames.length === 0) {
    return
  }

  mkdirSync('.changeset', { recursive: true })
  writeFileSync(join('.changeset', 'automatic-cli-release.md'), changesetMarkdown(packageNames))
}

const writePackageOutput = (packageOutputPath: string, packageNames: readonly string[]): void => {
  const packageOutputDirectory = dirname(packageOutputPath)

  if (packageOutputDirectory !== '.') {
    mkdirSync(packageOutputDirectory, { recursive: true })
  }

  writeFileSync(packageOutputPath, packageNames.length === 0 ? '' : `${packageNames.join('\n')}\n`)
}

const readPackageOutput = (packageOutputPath: string): string[] =>
  readFileSync(packageOutputPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const cliDirectoryNameFromPackage = (packageName: string): string => {
  if (!packageName.startsWith(garagePackagePrefix) || !packageName.endsWith(cliSuffix)) {
    throw new Error(`Unsupported CLI package name: ${packageName}`)
  }

  return packageName.slice(garagePackagePrefix.length)
}

const packageVersion = (packageName: string): string => {
  const directoryName = cliDirectoryNameFromPackage(packageName)
  const packageJson = readFileSync(join('apps', directoryName, 'package.json'), 'utf-8')
  const match = /"version"\s*:\s*"([^"]+)"/u.exec(packageJson)
  const version = match?.[1]

  if (version === undefined) {
    throw new Error(`Could not find version for ${packageName}`)
  }

  return version
}

const gitTagExists = (tagName: string): boolean => {
  const result = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tagName}`], { encoding: 'utf-8' })

  return result.status === 0
}

const createGitTag = (tagName: string): void => {
  const result = spawnSync('git', ['tag', tagName], { encoding: 'utf-8' })

  if (result.status !== 0) {
    throw new Error(`git tag failed for ${tagName}: ${result.stderr.trim()}`)
  }
}

const tagReleasedPackages = (packageNames: readonly string[]): void => {
  for (const packageName of packageNames) {
    const directoryName = cliDirectoryNameFromPackage(packageName)
    const tagName = `${directoryName}-v${packageVersion(packageName)}`

    if (!gitTagExists(tagName)) {
      createGitTag(tagName)
    }
  }
}

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

const writeCommand = (args: readonly string[]): void => {
  const baseRef = valueAfter(args, '--base')
  const headRef = valueAfter(args, '--head')
  const packageOutputPath = valueAfter(args, '--package-output')

  if (baseRef === undefined || headRef === undefined || packageOutputPath === undefined) {
    throw new Error(usage)
  }

  const packageNames = affectedCliPackages(changedFilesBetween(baseRef, headRef), discoverCliNames())
  writeAutomaticChangeset(packageNames)
  writePackageOutput(packageOutputPath, packageNames)
}

const tagCommand = (args: readonly string[]): void => {
  const packageOutputPath = valueAfter(args, '--package-output')

  if (packageOutputPath === undefined) {
    throw new Error(usage)
  }

  tagReleasedPackages(readPackageOutput(packageOutputPath))
}

const main = (): void => {
  try {
    const args = process.argv.slice(2)
    const [command] = args

    if (command === 'write') {
      writeCommand(args)
      return
    }

    if (command === 'tag') {
      tagCommand(args)
      return
    }

    throw new Error(usage)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI versioning error'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  main()
}
