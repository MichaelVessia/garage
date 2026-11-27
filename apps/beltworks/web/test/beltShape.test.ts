import { assert, it } from '@effect/vitest'
import type { BuildingAt, Direction } from '@garage/beltworks-domain'
import { key } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

import { beltShape } from '../src/beltShape.ts'

function shape(neighbors: Record<string, { dir: Direction; kind: 'belt' | 'splitter' | 'combiner' }>) {
  const at: BuildingAt = (c) => Option.fromUndefinedOr(neighbors[key(c)])
  return beltShape({ cell: { gx: 1, gy: 1 }, dir: 'N', at })
}
it('caps an isolated belt and connects a straight track to a side intake', () => {
  assert.deepEqual(shape({}), { kind: 'straight', inDirs: [], connected: false })
  assert.deepEqual(shape({ '1,2': { dir: 'N', kind: 'belt' }, '1,0': { dir: 'E', kind: 'combiner' } }), {
    kind: 'straight',
    inDirs: ['S'],
    connected: true,
  })
  assert.isFalse(shape({ '1,0': { dir: 'N', kind: 'combiner' } }).connected)
})
it('bends from either side and opens both channels at a merge', () => {
  const left = { dir: 'E', kind: 'belt' } as const
  const right = { dir: 'S', kind: 'splitter' } as const
  assert.equal(shape({ '0,1': left }).kind, 'turnLeft')
  assert.equal(shape({ '2,1': right }).kind, 'turnRight')
  assert.deepEqual(shape({ '0,1': left, '2,1': right }), { kind: 'merge', inDirs: ['W', 'E'], connected: false })
})
