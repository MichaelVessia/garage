import { assert, it } from '@effect/vitest'
import {
  Game,
  Progression,
  applyEdits,
  generate,
  initialResources,
  simulation,
  enqueue,
  exportSave,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { draw, createBoard, stats } from '../src/board.ts'
import { inspectCell } from '../src/inspector.ts'
import { pickToolForBuilding, tunnelPreview } from '../src/tools.ts'

it('syncs ore, factory edits and moving cargo to Pixi containers', () => {
  const board = createBoard()
  const made = Game.Runtime.make({ services: board.services, resources: initialResources() })
  if (!made.ok) {
    throw new Error('Invalid initial factory')
  }
  const runtime = made.value
  const empty = exportSave(runtime)
  runtime.tick(generate(0), draw)
  const visible = () => Arr.filter(board.veins.children, (n) => n.visible)
  assert.lengthOf(visible(), 2)
  runtime.tick(
    Game.Schedule(
      Game.System('Test/Unlock', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) =>
        resources.p.set({ ...resources.p.get(), milestoneIndex: 2, sparks: 40 })
      )
    )
  )
  enqueue({ type: 'expandBoard' })(runtime)
  runtime.tick(applyEdits, draw)
  assert.lengthOf(visible(), 7)
  const hub = Arr.findFirst(board.buildings.children, (n) => n.label === 'hub')
  if (Option.isNone(hub)) {
    throw new Error('Hub missing')
  }
  const inspect = (gx: number, gy: number) => inspectCell({ board, cell: { gx, gy }, ...runtime.inspect(stats) })
  assert.equal(inspect(7, 8), 'Vein 1 · Place Extractor')
  assert.equal(inspect(11, 8), 'Central Hub · Target 7 (0 / 35)')
  assert.equal(inspect(12, 9), 'Central Hub · Target 7 (0 / 35)')
  const count = hub.value.children.length
  hub.value.update({ kind: 'hub' }, 'N')
  assert.lengthOf(hub.value.children, count)
  enqueue({ type: 'placeBuilding', kind: 'extractor', gx: 7, gy: 8, dir: 'E' })(runtime)
  enqueue({ type: 'placeBuilding', kind: 'belt', gx: 8, gy: 8, dir: 'E' })(runtime)
  runtime.tick(simulation, draw)
  assert.lengthOf(board.buildings.children, 6)
  assert.equal(inspect(7, 8), 'Extractor · Mines 1 · 1.0/s')
  assert.equal(inspect(8, 8), 'Belt · Facing E')
  const miner = Arr.findFirst(board.buildings.children, (n) => n.label === 'extractor')
  assert.equal(Option.isSome(miner) && miner.value.symbol.text, '1')
  const cargo = board.items.children[0]
  assert.isDefined(cargo)
  if (cargo === undefined) {
    throw new Error('Expected cargo')
  }
  const x = cargo.x
  runtime.tick(simulation, draw)
  assert.isAbove(cargo.x, x)
  const belt = board.buildings.getChildByLabel('belt')
  if (belt === null) {
    throw new Error('Missing belt node')
  }
  const plate = belt.getChildAt(0)
  const angle = plate.rotation
  enqueue({ type: 'rotateBuilding', gx: 8, gy: 8 })(runtime)
  runtime.tick(applyEdits, draw)
  assert.closeTo(plate.rotation - angle, Math.PI / 2, 0.001)
  enqueue({ type: 'removeBuilding', gx: 8, gy: 8 })(runtime)
  runtime.tick(simulation, draw)
  assert.isTrue(cargo.destroyed)
  assert.lengthOf(board.buildings.children, 5)
  runtime.restore(empty)
  runtime.tick(draw)
  assert.lengthOf(board.veins.children, 0)
  assert.lengthOf(board.buildings.children, 0)
})

it('previews an exit ahead of an unpaired entry', () => {
  const preview = tunnelPreview({
    cell: { gx: 10, gy: 7 },
    facing: 'E',
    at: (c) => (c.gx === 7 ? Option.some({ kind: 'tunnelIn', dir: 'E' }) : Option.none()),
  })
  assert.deepEqual(preview, { kind: 'tunnelOut', partner: { gx: 7, gy: 7 } })
})

it('picks unlocked building tools by operation and tunnel end', () => {
  const multiplier = {
    kind: 'combiner',
    op: 'mul',
    remainingTicks: 0,
    slotA: Option.none<number>(),
    slotB: Option.none<number>(),
  } as const
  assert.deepEqual(pickToolForBuilding({ state: multiplier, milestoneIndex: 4 }), Option.some('mul'))
  assert.isTrue(Option.isNone(pickToolForBuilding({ state: multiplier, milestoneIndex: 0 })))
  assert.deepEqual(pickToolForBuilding({ state: { kind: 'tunnelOut' }, milestoneIndex: 4 }), Option.some('tunnel'))
  assert.deepEqual(
    pickToolForBuilding({ state: { kind: 'extractor', remainingTicks: 0 }, milestoneIndex: 0 }),
    Option.some('extractor')
  )
  assert.isTrue(Option.isNone(pickToolForBuilding({ state: { kind: 'hub' }, milestoneIndex: 4 })))
})
