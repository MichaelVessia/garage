import { assert, describe, it } from 'vitest'

import rootManifest from '../../../package.json'
import manifest from '../package.json'

describe('Pi package manifest', () => {
  it('loads the Garage-owned extension adapter directory', () => {
    assert.deepStrictEqual(manifest.pi.extensions, ['./extensions'])
  })

  it('does not expose the monorepo root as a Pi package', () => {
    assert.isFalse('pi' in rootManifest)
  })
})
