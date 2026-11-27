import { assert, it } from '@effect/vitest'
import type { BuildingAt, Direction } from '@garage/beltworks-domain'
import { initial } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

import { starterGuide } from '../src/onboarding.ts'

it('guides placement, connection, delivery and the first recipe from board state', () => {
  const vein = { gx: 13, gy: 12 }
  const buildings = new Map<number, { kind: 'extractor' | 'belt'; dir: Direction }>()
  const at: BuildingAt = ({ gx }) => Option.fromUndefinedOr(buildings.get(gx))
  const guide = (p: typeof initial, hasThree = false) => starterGuide({ p, vein: Option.some(vein), at, hasThree })
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
