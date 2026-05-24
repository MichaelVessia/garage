import { describe, expect, it } from 'vitest'

import { affectedCliPackages, changesetMarkdown } from './cli-versioning'

describe('affectedCliPackages', () => {
  const cliNames = ['adguard', 'booklore', 'sonarr']

  it('bumps a CLI when its app changes', () => {
    expect(affectedCliPackages(['apps/adguard-cli/src/index.ts'], cliNames)).toEqual(['@garage/adguard-cli'])
  })

  it('bumps a CLI when its backing package changes', () => {
    expect(affectedCliPackages(['packages/sonarr/src/operations.ts'], cliNames)).toEqual(['@garage/sonarr-cli'])
  })

  it('bumps every CLI when the shared protocol changes', () => {
    expect(affectedCliPackages(['packages/cli-protocol/src/index.ts'], cliNames)).toEqual([
      '@garage/adguard-cli',
      '@garage/booklore-cli',
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
