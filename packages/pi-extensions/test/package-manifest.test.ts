import { assert, describe, it } from 'vitest'

import manifest from '../package.json'

describe('Pi package manifest', () => {
  it('loads the Garage-owned extension adapter directory', () => {
    assert.deepStrictEqual(manifest.pi.extensions, ['./extensions'])
  })
})
