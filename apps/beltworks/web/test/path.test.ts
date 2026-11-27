import { assert, it } from '@effect/vitest'

import { beltPath } from '../src/path.ts'

it('fills skipped cells in order and turns the previous belt at a corner', () => {
  const start = { gx: 1, gy: 1 },
    turn = { gx: 3, gy: 1 },
    end = { gx: 3, gy: 2 }
  const straight = beltPath({ start, end: turn, facing: 'N', laneAt: () => 'empty' })
  assert.deepEqual(straight.commands, [
    { ...start, type: 'rotateBuilding' },
    { gx: 2, gy: 1, type: 'placeBuilding', kind: 'belt', dir: 'E' },
    { ...turn, type: 'placeBuilding', kind: 'belt', dir: 'E' },
  ])
  const corner = beltPath({ start: straight.cell, end, facing: straight.dir, laneAt: () => 'empty' })
  assert.deepEqual(corner.commands, [
    { ...turn, type: 'rotateBuilding' },
    { ...end, type: 'placeBuilding', kind: 'belt', dir: 'S' },
  ])
})
it('points the last belt into an occupied destination and stops painting', () => {
  const start = { gx: 5, gy: 8 }
  const path = beltPath({
    start,
    end: { gx: 2, gy: 8 },
    facing: 'S',
    laneAt: (cell) => (cell.gx === 4 ? 'blocked' : 'empty'),
  })
  assert.deepEqual(path.commands, [{ ...start, type: 'rotateBuilding' }])
  assert.isTrue(path.blocked)
})

it('turns a crossed belt in place and stops at a machine', () => {
  const start = { gx: 0, gy: 1 }
  const path = beltPath({
    start,
    end: { gx: 3, gy: 1 },
    facing: 'E',
    laneAt: ({ gx }) => (gx === 1 ? 'N' : 'blocked'),
  })
  assert.deepEqual(path.commands, [{ gx: 1, gy: 1, type: 'rotateBuilding' }])
  assert.deepEqual(path.cell, { gx: 1, gy: 1 })
  assert.isTrue(path.blocked)
})
