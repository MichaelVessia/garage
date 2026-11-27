import { assert, it } from '@effect/vitest'

import { expansionCamera } from '../src/camera.ts'

it('eases all camera coordinates toward the expanded floor and stops after 450 ms', () => {
  const from = { x: 0, y: 80, scale: 2 }
  const to = { x: 80, y: 0, scale: 1 }
  assert.deepEqual(expansionCamera({ from, to, elapsed: 0 }), from)
  assert.deepEqual(expansionCamera({ from, to, elapsed: 225 }), { x: 70, y: 10, scale: 1.125 })
  assert.deepEqual(expansionCamera({ from, to, elapsed: 450 }), to)
  assert.deepEqual(expansionCamera({ from, to, elapsed: 1000 }), to)
})
