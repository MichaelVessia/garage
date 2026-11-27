import { assert, it } from '@effect/vitest'
import type { BuildingState, Direction } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'

import { captureBlueprint, rotateBlueprint } from '../src/blueprint.ts'

it('copies machine settings from a reverse drag and leaves the hub and active cargo behind', () => {
  type Cells = Record<string, { facing: Direction; state: BuildingState }>
  const cells = {
    '2,4': { facing: 'E', state: { kind: 'hub' } },
    '3,4': { facing: 'N', state: { kind: 'filter', targetValue: 37 } },
    '2,5': {
      facing: 'W',
      state: { kind: 'combiner', op: 'div', remainingTicks: 10, slotA: Option.some(12), slotB: Option.none() },
    },
    '3,5': { facing: 'S', state: { kind: 'beacon', fuelTicks: 30 } },
    '4,5': { facing: 'E', state: { kind: 'belt' } },
  } satisfies Cells
  const entries = captureBlueprint({
    start: { gx: 3, gy: 5 },
    end: { gx: 2, gy: 4 },
    machineAt: ({ gx, gy }) => Rec.get<string, { facing: Direction; state: BuildingState }>(cells, gx + ',' + gy),
  })
  assert.deepEqual(entries, [
    { dx: 1, dy: 0, dir: 'N', kind: 'filter', targetValue: 37 },
    { dx: 0, dy: 1, dir: 'W', kind: 'combiner', op: 'div' },
    { dx: 1, dy: 1, dir: 'S', kind: 'beacon' },
  ])
})
it('turns a rectangular blueprint clockwise, including its ports', () => {
  const entries = [
    { dx: 0, dy: 0, dir: 'E', kind: 'belt' },
    { dx: 2, dy: 1, dir: 'S', kind: 'filter', targetValue: 7 },
  ] as const
  assert.deepEqual(rotateBlueprint(entries), [
    { dx: 1, dy: 0, dir: 'S', kind: 'belt' },
    { dx: 0, dy: 2, dir: 'W', kind: 'filter', targetValue: 7 },
  ])
  assert.deepEqual(rotateBlueprint(rotateBlueprint(rotateBlueprint(rotateBlueprint(entries)))), [...entries])
})
