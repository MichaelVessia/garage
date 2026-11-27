import { assert, it } from '@effect/vitest'
import { columns, rows } from '@garage/beltworks-domain'

import { tile } from '../src/machines.ts'
import { mapCamera } from '../src/minimap.ts'

it('centers the selected minimap point in the visible board at the current zoom', () => {
  const viewport = { width: 960, height: 560, top: 84 }
  for (const scale of [0.5, 1.5]) {
    for (const { x, y } of [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.75 },
      { x: 1, y: 1 },
    ]) {
      const camera = mapCamera({ viewport, scale, x, y })
      assert.equal(camera.x + x * columns * tile * scale, 480)
      assert.equal(camera.y + y * rows * tile * scale, 364)
    }
  }
})
