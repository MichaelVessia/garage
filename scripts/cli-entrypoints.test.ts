import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const cliEntrypoints = async (): Promise<ReadonlyArray<string>> => {
  const entries = await readdir('apps', { withFileTypes: true })
  const paths = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('-cli'))
      .map(async (entry) => {
        const path = join('apps', entry.name, 'src', 'main.ts')

        try {
          await access(path)
          return path
        } catch {
          return null
        }
      })
  )

  return paths.filter((path): path is string => path !== null)
}

describe('CLI entrypoints', () => {
  it('run main programs through the Bun Effect runtime', async () => {
    const entrypoints = await cliEntrypoints()

    expect(entrypoints.length).toBeGreaterThan(0)

    for (const entrypoint of entrypoints) {
      const source = await readFile(entrypoint, 'utf-8')

      expect(source, `${entrypoint} should import BunRuntime`).toMatch(
        /import\s+\{[^}]*\bBunRuntime\b[^}]*\}\s+from\s+'@effect\/platform-bun'/su
      )
      expect(source, `${entrypoint} should use BunRuntime.runMain`).toContain('BunRuntime.runMain(program)')
      expect(source, `${entrypoint} should not bypass the runtime`).not.toContain('Effect.runPromise(program)')
    }
  })

  it('keep Effect layer diagnostics enabled in main programs', async () => {
    const entrypoints = await cliEntrypoints()

    expect(entrypoints.length).toBeGreaterThan(0)

    for (const entrypoint of entrypoints) {
      const source = await readFile(entrypoint, 'utf-8')

      expect(source, `${entrypoint} should not suppress strictEffectProvide`).not.toContain('strictEffectProvide')
      expect(source, `${entrypoint} should not provide the Live layer directly`).not.toContain('Effect.provide(Live)')
      expect(source, `${entrypoint} should hide platform layers from provideMerge`).not.toMatch(
        /Layer\.provideMerge\([^)]*Bun(?:FileSystem|HttpClient|Path|Services)\.layer/su
      )
    }
  })
})
