import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as ER from 'effect/Result'
import * as S from 'effect/Schema'

import {
  ResourceVein,
  applyEdits,
  inBounds,
  TUNNEL_MAX_SPAN,
  Building,
  CommandRejected,
  Game,
  GridCell,
  GridIndex,
  ItemCrafted,
  ItemDelivered,
  MilestoneCompleted,
  OnTile,
  Progression,
  WorldPosition,
  createRuntime,
  createRuntimeFromSave,
  exportSave,
  simulation,
} from '../src/index.ts'
import type { CombinerOp, Command, Runtime } from '../src/index.ts'
import { fixtures } from './fixtures.ts'

const { advance, belt, extractor, factory, feed, place } = fixtures

const state = Game.Inspector(
  'Test/Stats',
  {
    resources: { p: Game.System.readResource(Progression), index: Game.System.readResource(GridIndex) },
    queries: {
      veins: Game.Query({ selection: { cell: Game.Query.read(GridCell), vein: Game.Query.read(ResourceVein) } }),
      cargo: Game.Query({ selection: { tile: Game.Query.read(OnTile) } }),
      machines: Game.Query({ selection: { building: Game.Query.read(Building), cell: Game.Query.read(GridCell) } }),
    },
  },
  ({ resources, queries }) => ({
    p: resources.p.get(),
    index: resources.index.get(),
    veins: Arr.map(queries.veins.each(), (e) => ({
      ...queries.veins.data.cell.get(e),
      value: queries.veins.data.vein.get(e).value,
    })),
    tiles: Arr.map(queries.cargo.each(), (e) => queries.cargo.data.tile.get(e)),
    buildings: Arr.map(queries.machines.each(), (e) => queries.machines.data.building.get(e)),
  })
)
const grant = (runtime: Runtime, milestoneIndex = 6) => {
  const grantProgress = Game.System(
    'Test/Grant',
    { resources: { p: Game.System.writeResource(Progression) } },
    ({ resources }) =>
      resources.p.set({
        ...resources.p.get(),
        milestoneIndex,
        sparks: 1000,
        vault: { 1: 15, 3: 25, 7: 60, 12: 120, 24: 80 },
      })
  )
  runtime.tick(Game.Schedule(grantProgress))
}
it('delivers fifteen ones, unlocks addition and consumes subsequent unmatched items', () => {
  const r = factory()
  const completed: Array<number> = []
  const payments: Array<number> = []
  const observe = Game.Schedule(
    Game.System(
      'Test/Deliveries',
      {
        events: {
          delivery: Game.System.readEvent(ItemDelivered),
          milestone: Game.System.readEvent(MilestoneCompleted),
        },
      },
      ({ events }) => {
        for (const event of events.delivery.all()) {
          payments.push(event.sparksEarned)
        }
        for (const event of events.milestone.all()) {
          completed.push(event.targetValue)
        }
      }
    )
  )
  for (let i = 0; i < 1400; i++) {
    r.tick(simulation, observe)
    if (i === 500) {
      const { p } = r.inspect(state)
      assert.isAbove(p.delivered[1] ?? 0, 0)
      assert.equal(p.rateByValue[1], p.delivered[1])
    }
  }
  const { p } = r.inspect(state)
  assert.equal(p.milestoneIndex, 1)
  assert.equal(p.vault[1], p.totalDelivered)
  assert.equal(p.sparks, p.totalDelivered)
  assert.deepEqual(completed, [1])
  assert.equal(payments.at(-1), 1)
  assert.isAbove(p.totalDelivered, 15)
  place(r, { type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 14, gy: 9, dir: 'E' })
  advance(r, 1)
  assert.include(
    Arr.map(r.inspect(state).buildings, (b) => b.kind),
    'combiner'
  )
})
it('carries a number around the inside of a belt corner', () => {
  const r = createRuntime(0)
  place(r, extractor, { type: 'placeBuilding', kind: 'belt', gx: 14, gy: 12, dir: 'N' })
  advance(r, 21)
  const path = Game.Inspector(
    'Test/Corner',
    { queries: { items: Game.Query({ selection: { position: Game.Query.read(WorldPosition) } }) } },
    ({ queries }) => Arr.map(queries.items.each(), (e) => queries.items.data.position.get(e))
  )
  assert.deepEqual(r.inspect(path), [{ x: 14.375, y: 12.375 }])
})
it('rejects placement on the hub, locked machines and extractors without veins', () => {
  const r = createRuntime(0)
  place(
    r,
    belt(17),
    { ...extractor, gx: 14 },
    { type: 'placeBuilding', kind: 'trash', gx: 13, gy: 10, dir: 'W' },
    belt(10, 8),
    { type: 'expandBoard' }
  )
  const reasons: Array<string> = []
  const observe = Game.System(
    'Test/Rejections',
    { events: { rejected: Game.System.readEvent(CommandRejected) } },
    ({ events }) => {
      for (const e of events.rejected.all()) {
        reasons.push(e.reason)
      }
    }
  )
  r.tick(simulation, Game.Schedule(observe))
  assert.deepEqual(reasons, [
    'Cell unavailable',
    'Extractor requires a vein',
    'Building locked',
    'Expand workshop to build here',
    'Expansion unavailable',
  ])
})
const recipes: ReadonlyArray<readonly [CombinerOp, number, number, number]> = [
  ['add', 1, 2, 3],
  ['sub', 5, 2, 3],
  ['sub', 2, 5, 0],
  ['mul', 3, 4, 12],
]
it.each(recipes)('crafts %s with %i and %i to make %i', (op, a, b, result) => {
  const r = createRuntime(0)
  grant(r)
  place(
    r,
    { type: 'placeBuilding', kind: 'combiner', op, gx: 16, gy: 12, dir: 'E' },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 11, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 13, dir: 'N' }
  )
  advance(r, 1)
  feed(r, [
    { gx: 16, gy: 11, value: a },
    { gx: 16, gy: 13, value: b },
  ])
  const products: Array<number> = []
  const observe = Game.System(
    'Test/Products',
    { events: { crafted: Game.System.readEvent(ItemCrafted) } },
    ({ events }) => {
      for (const e of events.crafted.all()) {
        products.push(e.result)
      }
    }
  )
  advance(r, 20)
  const loaded = createRuntimeFromSave(exportSave(r))
  if (!loaded.ok) {
    throw new Error('Restore lost an active recipe')
  }
  for (let i = 0; i < 40; i++) {
    r.tick(simulation, Game.Schedule(observe))
  }
  advance(loaded.value, 40)
  assert.deepEqual(exportSave(loaded.value), exportSave(r))
  assert.deepEqual(products, [result])
  assert.equal(r.inspect(state).p.totalDelivered, 1)
})
it('alternates splitter ports and uses the open port when the preferred port is blocked', () => {
  const r = createRuntime(0)
  grant(r)
  place(r, { type: 'expandBoard' })
  place(r, { type: 'placeBuilding', kind: 'splitter', gx: 10, gy: 8, dir: 'E' }, belt(10, 7), belt(10, 9))
  advance(r, 1)
  const send = () => {
    feed(r, [{ gx: 10, gy: 8, value: 1 }])
    advance(r, 1)
  }
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['10,7'])
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['10,7', '10,9'])
  place(r, belt(11, 9))
  advance(r, 40)
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['10,7', '10,9', '11,9'])
})
it('stalls a packed belt and moves both items in the tick that the line opens', () => {
  const r = createRuntime(0)
  place(r, belt(14), belt(15))
  advance(r, 1)
  feed(r, [
    { gx: 14, gy: 12, value: 1 },
    { gx: 15, gy: 12, value: 2 },
  ])
  advance(r, 80)
  assert.deepEqual(
    Arr.map(r.inspect(state).tiles, (t) => t.progress),
    [1000, 1000]
  )
  place(r, belt(16))
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['15,12', '16,12'])
  assert.deepEqual(
    Arr.map(r.inspect(state).tiles, (t) => t.progress),
    [0, 0]
  )
})
const deliveries = (extractorTier: boolean, beltTier: boolean) => {
  const r = factory()
  grant(r)
  if (extractorTier) {
    place(r, { type: 'buyUpgrade', upgrade: 'extractorSpeed' }, { type: 'buyUpgrade', upgrade: 'extractorSpeed' })
  }
  if (beltTier) {
    place(r, { type: 'buyUpgrade', upgrade: 'beltSpeed' })
  }
  advance(r, 1200)
  return r.inspect(state).p.totalDelivered
}
it('increases throughput with faster extractors and belts', () => {
  const base = deliveries(false, false)
  const fasterExtractor = deliveries(true, false)
  assert.isAbove(fasterExtractor, base)
  assert.isAbove(deliveries(true, true), fasterExtractor)
})
it('replays commands and resumes a JSON save with a queued command', () => {
  const first = factory()
  const second = factory()
  for (const r of [first, second]) {
    advance(r, 210)
    place(r, belt(14, 9))
  }
  const saved = exportSave(first)
  assert.deepEqual(exportSave(second), saved)
  const json = S.fromJsonString(S.Unknown)
  const encoded = S.encodeResult(json)(saved)
  assert.isTrue(ER.isSuccess(encoded))
  if (ER.isFailure(encoded)) {
    throw new Error('Encoding failed')
  }
  const decoded = S.decodeResult(json)(encoded.success)
  if (ER.isFailure(decoded)) {
    throw new Error('Decoding failed')
  }
  const restored = createRuntimeFromSave(decoded.success)
  if (!restored.ok) {
    throw new Error('Restore failed')
  }
  for (const r of [first, restored.value]) {
    advance(r, 300)
  }
  assert.deepEqual(exportSave(first), exportSave(restored.value))
  assert.isFalse(createRuntimeFromSave({ version: 0 }).ok)
  assert.isFalse(
    createRuntimeFromSave({
      ...saved,
      resources: { ...saved.resources, 'Beltworks/GridIndex': { buildings: {}, veins: {}, items: {} } },
    }).ok
  )
})
it('removes queued and occupied buildings and retains the generated board on reset', () => {
  const r = factory()
  advance(r, 181)
  const starting = r.inspect(state)
  place(r, { type: 'rotateBuilding', gx: 14, gy: 12 }, { type: 'removeBuilding', gx: 14, gy: 12 }, belt(8, 6), {
    type: 'resetBoard',
  })
  advance(r, 1)
  const after = r.inspect(state)
  assert.lengthOf(after.tiles, 0)
  assert.lengthOf(after.buildings, 4)
  assert.deepEqual(after.index.veins, starting.index.veins)
  assert.equal(after.p.totalDelivered, 0)
  assert.equal(after.p.sparks, 0)
})

it('opens each ring at its Spark and stock costs and keeps clustered veins within their ring', () => {
  for (const seed of [0, 19, 42, -17, 1000]) {
    const r = createRuntime(seed)
    const veins = r.inspect(state).veins
    const values = (tier: 0 | 1 | 2 | 3) =>
      Arr.sort(
        Arr.map(
          Arr.filter(veins, (v) => inBounds(v, tier) && (tier === 0 || !inBounds(v, ([0, 0, 1, 2] as const)[tier]))),
          (v) => v.value
        ),
        Order.Number
      )
    assert.deepEqual(values(0), [1, 2])
    assert.deepEqual(values(1), [1, 2, 3, 3, 4, 4])
    assert.includeMembers(values(2), [1, 2, 3, 5, 6, 7])
    assert.includeMembers(values(3), [4, 5, 7, 8, 9])
    place(r, { type: 'expandBoard' }, belt(10, 8))
    advance(r, 1)
    assert.isUndefined(r.inspect(state).index.buildings['10,8'])
    grant(r)
    place(r, { type: 'expandBoard' }, belt(10, 8))
    advance(r, 1)
    assert.equal(r.inspect(state).p.boardTier, 1)
    assert.equal(r.inspect(state).p.sparks, 965)
    assert.isDefined(r.inspect(state).index.buildings['10,8'])
    place(r, { type: 'expandBoard' }, belt(7, 5))
    advance(r, 1)
    assert.equal(r.inspect(state).p.boardTier, 2)
    assert.equal(r.inspect(state).p.sparks, 785)
    assert.isDefined(r.inspect(state).index.buildings['7,5'])
    place(r, { type: 'expandBoard' }, belt(1, 1))
    advance(r, 1)
    assert.equal(r.inspect(state).p.boardTier, 3)
    assert.equal(r.inspect(state).p.sparks, 135)
    assert.equal(r.inspect(state).p.vault[12] ?? 0, 0)
    assert.equal(r.inspect(state).p.vault[24] ?? 0, 0)
    assert.isDefined(r.inspect(state).index.buildings['1,1'])
    place(r, { type: 'resetBoard' })
    advance(r, 1)
    assert.equal(r.inspect(state).p.seed, seed)
  }
})
const tunnel = (gx: number, kind: 'tunnelIn' | 'tunnelOut'): Command => ({
  type: 'placeBuilding',
  kind,
  gx,
  gy: 9,
  dir: 'E',
})
it('carries cargo under a crossing and blocks surface traffic and a full exit', () => {
  const r = createRuntime(0)
  grant(r)
  const exit = 13 + TUNNEL_MAX_SPAN
  place(
    r,
    tunnel(13, 'tunnelIn'),
    tunnel(exit, 'tunnelOut'),
    { type: 'placeBuilding', kind: 'belt', gx: 15, gy: 9, dir: 'N' },
    belt(exit - 1, 9)
  )
  advance(r, 1)
  feed(r, [{ gx: exit - 1, gy: 9, value: 3 }])
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['17,9'])
  feed(r, [
    { gx: 13, gy: 9, value: 1 },
    { gx: 15, gy: 9, value: 2 },
  ])
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['15,9', '17,9', '18,9'])
  feed(r, [{ gx: 13, gy: 9, value: 4 }])
  advance(r, 45)
  assert.hasAllKeys(r.inspect(state).index.items, ['13,9', '15,9', '17,9', '18,9'])
  assert.isTrue(createRuntimeFromSave(exportSave(r)).ok)
  place(r, { type: 'removeBuilding', gx: exit, gy: 9 }, tunnel(exit + 1, 'tunnelOut'))
  advance(r, 1)
  assert.isDefined(r.inspect(state).index.items['13,9'])
  place(r, tunnel(14, 'tunnelIn'), tunnel(exit, 'tunnelOut'))
  advance(r, 1)
  assert.isDefined(r.inspect(state).index.items['13,9'])
})

it('opens one building tool at each milestone and gates all expansion purchases', () => {
  for (let index = 0; index <= 6; index++) {
    const r = createRuntime(0)
    grant(r, index)
    const kinds = ['add', 'splitter', 'tunnelIn', 'mul', 'sub', 'trash', 'tunnelOut'] as const
    for (const [i, kind] of kinds.entries()) {
      const cell = { gx: 12 + i, gy: 9, dir: 'E', type: 'placeBuilding' } as const
      place(
        r,
        kind === 'add' || kind === 'mul' || kind === 'sub' ? { ...cell, kind: 'combiner', op: kind } : { ...cell, kind }
      )
    }
    place(r, { type: 'expandBoard' }, { type: 'expandBoard' }, { type: 'expandBoard' })
    advance(r, 1)
    const { index: board, p } = r.inspect(state)
    for (const i of kinds.keys()) {
      assert.equal(board.buildings[12 + i + ',9'] !== undefined, index >= (i === 6 ? 3 : i + 1))
    }
    assert.equal(p.boardTier, index < 2 ? 0 : index < 4 ? 1 : index < 6 ? 2 : 3)
  }
})
it('clears a box and then the floor without changing deposits or progression', () => {
  const r = factory()
  grant(r)
  place(r, { type: 'expandBoard' }, { type: 'buyUpgrade', upgrade: 'beltSpeed' })
  advance(r, 180)
  const before = r.inspect(state)
  place(r, { type: 'removeArea', minX: 15, maxX: 900, minY: 12, maxY: 13 })
  r.tick(applyEdits)
  const partial = r.inspect(state)
  assert.hasAllKeys(partial.index.buildings, ['13,12', '14,12', '17,12', '18,12', '17,13', '18,13'])
  assert.isTrue(Arr.every(partial.tiles, (t) => t.gx < 15))
  place(r, belt(15), { type: 'clearFloor' })
  r.tick(applyEdits)
  const after = r.inspect(state)
  assert.lengthOf(after.buildings, 4)
  assert.lengthOf(after.tiles, 0)
  assert.deepEqual(after.p, before.p)
  assert.deepEqual(after.index.veins, before.index.veins)
  assert.isTrue(createRuntimeFromSave(exportSave(r)).ok)
})
