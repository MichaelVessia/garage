import { assert, it } from '@effect/vitest'
import type { BuildingAt, Cell, CombinerOp, Direction } from '@garage/beltworks-domain'
import { initial, key } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

import { combinerPorts, starterGuide } from '../src/onboarding.ts'

it('guides placement, connection, delivery and the first recipe from board state', () => {
  const vein = { gx: 13, gy: 12 }
  const buildings = new Map<number, { kind: 'extractor' | 'belt'; dir: Direction }>()
  const at: BuildingAt = ({ gx }) => Option.fromUndefinedOr(buildings.get(gx))
  const guide = (p: typeof initial, hasThree = false) =>
    starterGuide({ p, vein: Option.some(vein), at, hasThree, two: Option.none(), combiners: [], dismissed: false })
  assert.deepEqual(guide(initial), { step: 'extract', vein, nextTool: 'belt' })
  buildings.set(13, { kind: 'extractor', dir: 'E' })
  buildings.set(14, { kind: 'belt', dir: 'E' })
  assert.deepEqual(guide(initial), {
    step: 'connect',
    cells: [
      { gx: 15, gy: 12 },
      { gx: 16, gy: 12 },
    ],
  })
  buildings.set(15, { kind: 'belt', dir: 'E' })
  buildings.set(16, { kind: 'belt', dir: 'E' })
  assert.equal(guide(initial).step, 'waiting')
  assert.equal(guide({ ...initial, delivered: { 1: 1 } }).step, 'flowing')
  const crafting = { ...initial, milestoneIndex: 1 }
  assert.equal(guide(crafting).step, 'recipe')
  assert.equal(guide(crafting, true).step, 'hidden')
  assert.equal(guide({ ...crafting, delivered: { 3: 1 } }).step, 'hidden')
})

it('marks the two input paths, warns about a rear feed, and clears the recipe hints', () => {
  const vein = { gx: 13, gy: 12 }
  const two = { gx: 21, gy: 13 }
  const buildings = new Map<string, { kind: 'extractor' | 'belt' | 'hub' | 'combiner'; dir: Direction }>()
  const at: BuildingAt = (c) => Option.fromUndefinedOr(buildings.get(key(c)))
  const p = { ...initial, milestoneIndex: 1 }
  const combiners: Array<Cell & { dir: Direction; op: CombinerOp }> = []
  const guide = (dismissed = false) =>
    starterGuide({ p, vein: Option.some(vein), two: Option.some(two), at, combiners, dismissed, hasThree: false })
  assert.deepEqual(guide(), { step: 'mine-two', vein: two })
  buildings.set(key(vein), { kind: 'extractor', dir: 'E' })
  buildings.set(key(two), { kind: 'extractor', dir: 'E' })
  buildings.set('17,13', { kind: 'hub', dir: 'N' })
  buildings.set('18,13', { kind: 'hub', dir: 'N' })
  const suggested = guide()
  assert.equal(suggested.step, 'place-adder')
  if (suggested.step !== 'place-adder') {
    throw new Error('Missing Adder suggestion')
  }
  assert.deepEqual(suggested.a[0], vein)
  assert.deepEqual(suggested.b[0], two)
  const ports = combinerPorts({ cell: suggested.cell, facing: 'N' })
  assert.deepEqual(suggested.a.at(-1), ports.a)
  assert.deepEqual(suggested.b.at(-1), ports.b)
  buildings.set(key(suggested.cell), { kind: 'extractor', dir: 'N' })
  assert.notDeepEqual(guide(), suggested)
  buildings.set(key(suggested.cell), { kind: 'combiner', dir: 'N' })
  combiners.push({ ...suggested.cell, dir: 'N', op: 'add' })
  assert.equal(guide().step, 'recipe')
  const back = { gx: suggested.cell.gx, gy: suggested.cell.gy + 1 }
  buildings.set(key(back), { kind: 'belt', dir: 'N' })
  assert.deepEqual(guide(), { step: 'back-belt', cell: back })
  assert.equal(guide(true).step, 'hidden')
  p.craftedTargets = [3]
  assert.equal(guide().step, 'hidden')
})

it('rotates the external input and output markers with the Combiner', () => {
  const cell = { gx: 1, gy: 1 }
  const front = { gx: 1, gy: 0 },
    right = { gx: 2, gy: 1 },
    back = { gx: 1, gy: 2 },
    left = { gx: 0, gy: 1 }
  assert.deepEqual(combinerPorts({ cell, facing: 'N' }), { a: left, b: right, output: front })
  assert.deepEqual(combinerPorts({ cell, facing: 'E' }), { a: front, b: back, output: right })
  assert.deepEqual(combinerPorts({ cell, facing: 'S' }), { a: right, b: left, output: back })
  assert.deepEqual(combinerPorts({ cell, facing: 'W' }), { a: back, b: front, output: left })
})
