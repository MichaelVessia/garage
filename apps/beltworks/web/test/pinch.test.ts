import { assert, it } from '@effect/vitest'

import { pinchCamera } from '../src/pinch.ts'

const before = [
  { x: 40, y: 50 },
  { x: 60, y: 50 },
] as const
const camera = { x: 10, y: 20, scale: 1 }

it('keeps the original board point under the moving midpoint', () => {
  for (const [span, expectedScale] of [
    [10, 1],
    [20, 2],
    [1, 0.5],
    [50, 2.5],
  ] as const) {
    const after = [
      { x: 80 - span, y: 30 },
      { x: 80 + span, y: 30 },
    ] as const
    const next = pinchCamera({ before, after, camera, minScale: 0.5, maxScale: 2.5 })
    assert.equal(next.scale, expectedScale)
    assert.equal(next.x + 40 * next.scale, 80)
    assert.equal(next.y + 30 * next.scale, 30)
  }
})

it('can pan when both contacts start at the same point', () => {
  const next = pinchCamera({ before: [before[0], before[0]], after: before, camera, minScale: 0.5, maxScale: 2.5 })
  assert.deepEqual(next, { x: 20, y: 20, scale: 1 })
})
