import { assert, it } from '@effect/vitest'
import { initial } from '@garage/beltworks-domain'
import type { BuildingState } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { buildContextBatches, GpuGraphicsContext } from 'pixi.js'

import { Machine } from '../src/machines.ts'

const crafting: BuildingState = {
  kind: 'combiner',
  op: 'add',
  remainingTicks: 12,
  slotA: Option.some(1),
  slotB: Option.none(),
}

it.each([
  ['Hub progress', { kind: 'hub' }, false, 2],
  ['Combiner crafting', crafting, false, 2],
  ['Combiner crafting with a missing input ring', crafting, true, 2],
  ['active Beacon', { kind: 'beacon', fuelTicks: 60 }, false, 1],
  ['Extractor', { kind: 'extractor', remainingTicks: 20, surgeCount: 0, bonusPending: false }, false, 1],
] satisfies Array<[string, BuildingState, boolean, number]>)(
  'builds valid arc geometry for %s',
  (_, state, lens, count) => {
    const machine = new Machine()
    machine.update(state, 'N')
    machine.animate(12, { ...initial, delivered: { 1: 4 } }, lens)
    const context = machine.detail.context
    const gpu = new GpuGraphicsContext()
    buildContextBatches(context, gpu)
    assert.isAbove(gpu.geometryData.vertices.length, 0)
    assert.isTrue(Arr.every(gpu.geometryData.vertices, Number.isFinite))

    let arcs = 0
    for (const instruction of context.instructions) {
      if (instruction.action === 'stroke') {
        for (const { shape } of instruction.data.path.shapePath.shapePrimitives) {
          if ('points' in shape && Arr.isArray(shape.points)) {
            assert.notDeepEqual(shape.points.slice(0, 2), [0, 0])
            arcs++
          }
        }
      }
    }
    assert.equal(arcs, count)
  }
)
