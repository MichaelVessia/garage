import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import * as Rec from 'effect/Record'
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
  Item,
  ItemCrafted,
  ItemDelivered,
  MilestoneCompleted,
  OnTile,
  Progression,
  WorldPosition,
  createRuntime,
  createRuntimeFromSave,
  enqueue,
  exportSave,
  simulation,
} from '../src/index.ts'
import type { CombinerOp, Command, Runtime } from '../src/index.ts'

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
const advance = (runtime: Runtime, count: number) => {
  for (let i = 0; i < count; i++) {
    runtime.tick(simulation)
  }
}
const place = (runtime: Runtime, ...cmds: Array<Command>) => {
  for (const cmd of cmds) {
    enqueue(cmd)(runtime)
  }
}
const belt = (gx: number, gy = 8): Command => ({ type: 'placeBuilding', kind: 'belt', gx, gy, dir: 'E' })
const extractor: Command = { type: 'placeBuilding', kind: 'extractor', gx: 7, gy: 8, dir: 'E' }
const factory = () => {
  const r = createRuntime(0)
  place(r, extractor, belt(8), belt(9), belt(10))
  return r
}
const grant = (runtime: Runtime, milestoneIndex = 6) => {
  const grantProgress = Game.System(
    'Test/Grant',
    { resources: { p: Game.System.writeResource(Progression) } },
    ({ resources }) => resources.p.set({ ...resources.p.get(), milestoneIndex, sparks: 1000 })
  )
  runtime.tick(Game.Schedule(grantProgress))
}
it('delivers twelve ones, unlocks addition and consumes subsequent unmatched items', () => {
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
  for (let i = 0; i < 1100; i++) {
    r.tick(simulation, observe)
    if (i === 500) {
      const { p } = r.inspect(state)
      assert.isAbove(p.deliveredInMilestone, 0)
      assert.lengthOf(p.deliveryTicks, p.deliveredInMilestone)
    }
  }
  const { p } = r.inspect(state)
  assert.equal(p.milestoneIndex, 1)
  assert.deepEqual(p.deliveryTicks, [])
  assert.equal(p.sparks, 12)
  assert.deepEqual(completed, [1])
  assert.equal(payments.at(-1), 0)
  assert.isAbove(p.totalDelivered, 15)
  place(r, { type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 8, gy: 5, dir: 'E' })
  advance(r, 1)
  assert.include(
    Arr.map(r.inspect(state).buildings, (b) => b.kind),
    'combiner'
  )
})
it('carries a number around the inside of a belt corner', () => {
  const r = createRuntime(0)
  place(r, extractor, { type: 'placeBuilding', kind: 'belt', gx: 8, gy: 8, dir: 'N' })
  advance(r, 21)
  const path = Game.Inspector(
    'Test/Corner',
    { queries: { items: Game.Query({ selection: { position: Game.Query.read(WorldPosition) } }) } },
    ({ queries }) => Arr.map(queries.items.each(), (e) => queries.items.data.position.get(e))
  )
  assert.deepEqual(r.inspect(path), [{ x: 8.375, y: 8.375 }])
})
it('rejects placement on the hub, locked machines and extractors without veins', () => {
  const r = createRuntime(0)
  place(
    r,
    belt(11),
    { ...extractor, gx: 8 },
    { type: 'placeBuilding', kind: 'trash', gx: 7, gy: 6, dir: 'W' },
    belt(4, 4),
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
function feed(runtime: Runtime, loads: ReadonlyArray<{ gx: number; gy: number; value: number }>) {
  const load = Game.System(
    'Test/Feed',
    {
      commands: Game.System.commands(Game.System.spawns(Item, OnTile, WorldPosition)),
      resources: { index: Game.System.writeResource(GridIndex) },
    },
    ({ commands, resources }) => {
      const index = resources.index.get()
      const items = { ...index.items }
      for (const { gx, gy, value } of loads) {
        items[`${gx},${gy}`] = commands.spawn(
          Game.Command.spawn(
            [Item, { value }],
            [OnTile, { gx, gy, fromDir: 'W', progress: 1000, prevProgress: 1000 }],
            [WorldPosition, { x: gx, y: gy }]
          )
        )
      }
      resources.index.set({ ...index, items })
    }
  )
  runtime.tick(Game.Schedule(load, Game.Schedule.applyDeferred()))
}
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
    { type: 'placeBuilding', kind: 'combiner', op, gx: 10, gy: 8, dir: 'E' },
    { type: 'placeBuilding', kind: 'belt', gx: 10, gy: 7, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', gx: 10, gy: 9, dir: 'N' }
  )
  advance(r, 1)
  feed(r, [
    { gx: 10, gy: 7, value: a },
    { gx: 10, gy: 9, value: b },
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
  advance(r, 26)
  advance(loaded.value, 26)
  assert.deepEqual(exportSave(loaded.value), exportSave(r))
  r.tick(Game.Schedule(observe))
  assert.deepEqual(products, [result])
  assert.equal(r.inspect(state).p.totalDelivered, 1)
})
it('alternates splitter ports and uses the open port when the preferred port is blocked', () => {
  const r = createRuntime(0)
  grant(r)
  place(r, { type: 'expandBoard' })
  place(r, { type: 'placeBuilding', kind: 'splitter', gx: 4, gy: 4, dir: 'E' }, belt(4, 3), belt(4, 5))
  advance(r, 1)
  const send = () => {
    feed(r, [{ gx: 4, gy: 4, value: 1 }])
    advance(r, 1)
  }
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['4,3'])
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['4,3', '4,5'])
  place(r, belt(5, 5))
  advance(r, 40)
  send()
  assert.containsAllKeys(r.inspect(state).index.items, ['4,3', '4,5', '5,5'])
})
it('stalls a packed belt and moves both items in the tick that the line opens', () => {
  const r = createRuntime(0)
  place(r, belt(8), belt(9))
  advance(r, 1)
  feed(r, [
    { gx: 8, gy: 8, value: 1 },
    { gx: 9, gy: 8, value: 2 },
  ])
  advance(r, 80)
  assert.deepEqual(
    Arr.map(r.inspect(state).tiles, (t) => t.progress),
    [1000, 1000]
  )
  place(r, belt(10))
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['9,8', '10,8'])
  assert.deepEqual(
    Arr.map(r.inspect(state).tiles, (t) => t.progress),
    [0, 0]
  )
})
const deliveries = (extractorTier: boolean, beltTier: boolean) => {
  const r = factory()
  grant(r)
  if (extractorTier) {
    place(r, { type: 'buyUpgrade', upgrade: 'extractorSpeed' })
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
    place(r, belt(8, 5))
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
it('runs 10,000 active ticks and expires old delivery times', () => {
  const r = createRuntime(0)
  grant(r)
  place(
    r,
    { ...extractor, dir: 'N' },
    belt(7, 7),
    belt(8, 7),
    { ...extractor, gx: 15, gy: 9, dir: 'N' },
    { type: 'placeBuilding', kind: 'belt', gx: 15, gy: 8, dir: 'N' },
    { type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 9, gy: 7, dir: 'S' },
    belt(9),
    belt(10)
  )
  r.tick(
    Game.Schedule(
      Game.System(
        'Test/StartRateWindow',
        { resources: { p: Game.System.writeResource(Progression) } },
        ({ resources }) => resources.p.set({ ...resources.p.get(), deliveryTicks: [0] })
      )
    )
  )
  for (let gx = 15; gx >= 10; gx--) {
    place(r, { type: 'placeBuilding', kind: 'belt', gx, gy: 7, dir: 'W' })
  }
  advance(r, 10_000)
  const { p, tiles, index } = r.inspect(state)
  assert.isAbove(p.totalDelivered, 100)
  assert.deepEqual(p.deliveryTicks, [])
  assert.lengthOf(Rec.keys(index.items), tiles.length)
})

it('removes queued and occupied buildings and retains the generated board on reset', () => {
  const r = factory()
  advance(r, 181)
  const starting = r.inspect(state)
  place(r, { type: 'rotateBuilding', gx: 8, gy: 8 }, { type: 'removeBuilding', gx: 8, gy: 8 }, belt(2, 2), {
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

it('opens each ring at its Spark cost and keeps clustered veins within their ring', () => {
  for (const seed of [0, 19, 42, -17, 1000]) {
    const r = createRuntime(seed)
    const veins = r.inspect(state).veins
    const values = (tier: 0 | 1 | 2) =>
      Arr.sort(
        Arr.map(
          Arr.filter(veins, (v) => inBounds(v, tier) && (tier === 0 || !inBounds(v, tier === 2 ? 1 : 0))),
          (v) => v.value
        ),
        Order.Number
      )
    assert.deepEqual(values(0), [1, 2])
    assert.deepEqual(values(1), [2, 3, 3, 4, 4])
    assert.deepEqual(values(2), [1, 1, 5, 5, 5, 6, 6, 7, 7, 7])
    place(r, { type: 'expandBoard' }, belt(4, 4))
    advance(r, 1)
    assert.isUndefined(r.inspect(state).index.buildings['4,4'])
    grant(r)
    place(r, { type: 'expandBoard' }, belt(4, 4))
    advance(r, 1)
    assert.equal(r.inspect(state).p.boardTier, 1)
    assert.equal(r.inspect(state).p.sparks, 965)
    assert.isDefined(r.inspect(state).index.buildings['4,4'])
    place(r, { type: 'expandBoard' }, belt(1, 1), { type: 'expandBoard' })
    advance(r, 1)
    assert.equal(r.inspect(state).p.boardTier, 2)
    assert.equal(r.inspect(state).p.sparks, 845)
    assert.isDefined(r.inspect(state).index.buildings['1,1'])
  }
})
const tunnel = (gx: number, kind: 'tunnelIn' | 'tunnelOut'): Command => ({
  type: 'placeBuilding',
  kind,
  gx,
  gy: 5,
  dir: 'E',
})
it('carries cargo under a crossing and blocks surface traffic and a full exit', () => {
  const r = createRuntime(0)
  grant(r)
  const exit = 7 + TUNNEL_MAX_SPAN
  place(
    r,
    tunnel(7, 'tunnelIn'),
    tunnel(exit, 'tunnelOut'),
    { type: 'placeBuilding', kind: 'belt', gx: 9, gy: 5, dir: 'N' },
    belt(exit - 1, 5)
  )
  advance(r, 1)
  feed(r, [{ gx: exit - 1, gy: 5, value: 3 }])
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['11,5'])
  feed(r, [
    { gx: 7, gy: 5, value: 1 },
    { gx: 9, gy: 5, value: 2 },
  ])
  advance(r, 1)
  assert.hasAllKeys(r.inspect(state).index.items, ['9,5', '11,5', '12,5'])
  feed(r, [{ gx: 7, gy: 5, value: 4 }])
  advance(r, 45)
  assert.hasAllKeys(r.inspect(state).index.items, ['7,5', '9,5', '11,5', '12,5'])
  assert.isTrue(createRuntimeFromSave(exportSave(r)).ok)
  place(r, { type: 'removeBuilding', gx: exit, gy: 5 }, tunnel(exit + 1, 'tunnelOut'))
  advance(r, 1)
  assert.isDefined(r.inspect(state).index.items['7,5'])
  place(r, tunnel(8, 'tunnelIn'), tunnel(exit, 'tunnelOut'))
  advance(r, 1)
  assert.isDefined(r.inspect(state).index.items['7,5'])
})

it('opens one building tool at each milestone and gates both expansion purchases', () => {
  for (let index = 0; index <= 6; index++) {
    const r = createRuntime(0)
    grant(r, index)
    const kinds = ['add', 'splitter', 'tunnelIn', 'mul', 'sub', 'trash', 'tunnelOut'] as const
    for (const [i, kind] of kinds.entries()) {
      const cell = { gx: 6 + i, gy: 5, dir: 'E', type: 'placeBuilding' } as const
      place(
        r,
        kind === 'add' || kind === 'mul' || kind === 'sub' ? { ...cell, kind: 'combiner', op: kind } : { ...cell, kind }
      )
    }
    place(r, { type: 'expandBoard' }, { type: 'expandBoard' })
    advance(r, 1)
    const { index: board, p } = r.inspect(state)
    for (const i of kinds.keys()) {
      assert.equal(board.buildings[6 + i + ',5'] !== undefined, index >= (i === 6 ? 3 : i + 1))
    }
    assert.equal(p.boardTier, index < 2 ? 0 : index < 4 ? 1 : 2)
  }
})
it('clears a box and then the floor without changing deposits or progression', () => {
  const r = factory()
  grant(r)
  place(r, { type: 'expandBoard' }, { type: 'buyUpgrade', upgrade: 'beltSpeed' })
  advance(r, 180)
  const before = r.inspect(state)
  place(r, { type: 'removeArea', minX: 9, maxX: 900, minY: 8, maxY: 9 })
  r.tick(applyEdits)
  const partial = r.inspect(state)
  assert.hasAllKeys(partial.index.buildings, ['7,8', '8,8', '11,8', '12,8', '11,9', '12,9'])
  assert.isTrue(Arr.every(partial.tiles, (t) => t.gx < 9))
  place(r, belt(9), { type: 'clearFloor' })
  r.tick(applyEdits)
  const after = r.inspect(state)
  assert.lengthOf(after.buildings, 4)
  assert.lengthOf(after.tiles, 0)
  assert.deepEqual(after.p, before.p)
  assert.deepEqual(after.index.veins, before.index.veins)
  assert.isTrue(createRuntimeFromSave(exportSave(r)).ok)
})
