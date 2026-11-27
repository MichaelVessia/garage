import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Rec from 'effect/Record'
import * as ER from 'effect/Result'
import * as S from 'effect/Schema'

import {
  ResourceVein,
  milestoneFor,
  suggestRecipe,
  toolUnlock,
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
  MedalUnlocked,
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
it('delivers eight ones, unlocks addition and consumes subsequent unmatched items', () => {
  const r = factory()
  const medals: Array<string> = []
  const completed: Array<number> = []
  const payments: Array<number> = []
  const observe = Game.Schedule(
    Game.System(
      'Test/Deliveries',
      {
        events: {
          delivery: Game.System.readEvent(ItemDelivered),
          milestone: Game.System.readEvent(MilestoneCompleted),
          medal: Game.System.readEvent(MedalUnlocked),
        },
      },
      ({ events }) => {
        for (const event of events.medal.all()) {
          medals.push(event.medal)
        }
        for (const event of events.delivery.all()) {
          assert.equal(event.intakeSide, 'W')
          payments.push(event.sparksEarned)
        }
        for (const event of events.milestone.all()) {
          completed.push(event.targetValue)
          assert.lengthOf(payments, 8)
          assert.equal(event.bonusSparks, 12)
        }
      }
    )
  )
  for (let i = 0; i < 1400; i++) {
    r.tick(simulation, observe)
    if (i === 350) {
      const { p } = r.inspect(state)
      assert.isAbove(p.delivered[1] ?? 0, 0)
      assert.equal(p.rateByValue[1], p.delivered[1])
    }
  }
  const { p } = r.inspect(state)
  assert.equal(p.milestoneIndex, 1)
  assert.equal(p.vault[1], p.totalDelivered)
  assert.equal(p.sparks, p.totalDelivered + 12)
  assert.deepEqual(completed, [1])
  assert.deepEqual(medals, ['firstDelivery'])
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
  ['div', 7, 2, 3],
  ['div', 7, 0, 0],
]
it.each(recipes)('crafts %s with %i and %i to make %i', (op, a, b, result) => {
  const r = createRuntime(0)
  grant(r, 8)
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
it('marks the first crafted target once across a save and reload', () => {
  let runtime = createRuntime(0)
  grant(runtime, 1)
  place(
    runtime,
    { type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 16, gy: 12, dir: 'E' },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 11, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 13, dir: 'N' }
  )
  runtime.tick(applyEdits)
  const first: Array<boolean> = []
  const observe = Game.Schedule(
    Game.System('Test/FirstCraft', { events: { craft: Game.System.readEvent(ItemCrafted) } }, ({ events }) => {
      for (const event of events.craft.all()) {
        first.push(event.firstTarget)
      }
    })
  )
  for (let i = 0; i < 2; i++) {
    feed(runtime, [
      { gx: 16, gy: 11, value: 1 },
      { gx: 16, gy: 13, value: 2 },
    ])
    for (let tick = 0; tick < 80; tick++) {
      runtime.tick(simulation, observe)
    }
    const restored = createRuntimeFromSave(exportSave(runtime))
    if (!restored.ok) {
      throw new Error('Could not restore first craft')
    }
    runtime = restored.value
  }
  assert.deepEqual(first, [true, false])
  assert.deepEqual(runtime.inspect(state).p.craftedTargets, [3])
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
it('keeps the input turn and earned medal when loading an old junction', () => {
  const r = createRuntime(0)
  place(r, belt(16))
  r.tick(applyEdits)
  const save = exportSave(r)
  const { p, index } = r.inspect(state)
  const { bestRunTicks: _time, ...meta } = p.meta
  const loaded = createRuntimeFromSave({
    ...save,
    entities: Arr.map(save.entities, (entity) => {
      const components = entity.components
      return entity.id === index.buildings['16,12']
        ? { ...entity, components: { ...components, 'Beltworks/Building': { kind: 'merger', nextInput: 2 } } }
        : entity
    }),
    resources: {
      ...save.resources,
      'Beltworks/Progression': {
        ...p,
        meta: { ...meta, medals: ['blueprintArchitect'] },
      },
    },
  })
  if (!loaded.ok) {
    throw new Error('Legacy junction restore failed')
  }
  const board = loaded.value.inspect(state)
  assert.deepInclude(board.buildings, { kind: 'belt', nextInput: 2 })
  assert.deepEqual(board.p.meta.medals, ['contractRunner'])
})
it('restores a save that predates medals', () => {
  const r = createRuntime(2)
  const saved = exportSave(r)
  const p = r.inspect(state).p
  const { runTicks: _ticks, meta, ...rest } = p
  const { medals: _medals, bestRunTicks: _best, ...oldMeta } = meta
  const legacy = { ...rest, meta: oldMeta }
  const restored = createRuntimeFromSave({
    ...saved,
    resources: { ...saved.resources, 'Beltworks/Progression': legacy },
  })
  if (!restored.ok) {
    throw new Error('Legacy restore failed')
  }
  assert.deepEqual(restored.value.inspect(state).p, p)
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
    assert.equal(r.inspect(state).p.meta.seed, seed)
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
  assert.deepEqual(r.inspect(state).p.meta.medals, ['underground'])
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
  for (let index = 0; index <= 8; index++) {
    const r = createRuntime(0)
    grant(r, index)
    const kinds = [
      'add',
      'splitter',
      'tunnelIn',
      'mul',
      'filter',
      'trash',
      'tunnelOut',
      'sub',
      'beacon',
      'div',
    ] as const
    for (const [i, kind] of kinds.entries()) {
      const cell = { gx: 12 + i, gy: 9, dir: 'E', type: 'placeBuilding' } as const
      place(
        r,
        kind === 'add' || kind === 'mul' || kind === 'sub' || kind === 'div'
          ? { ...cell, kind: 'combiner', op: kind }
          : { ...cell, kind }
      )
    }
    place(r, { type: 'expandBoard' }, { type: 'expandBoard' }, { type: 'expandBoard' })
    advance(r, 1)
    const { index: board, p } = r.inspect(state)
    for (const i of kinds.keys()) {
      assert.equal(
        board.buildings[12 + i + ',9'] !== undefined,
        index >= ([1, 2, 3, 4, 5, 6, 3, 6, 7, 8][i] ?? Infinity)
      )
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

it('routes filter cargo from the rear and keeps blocked cargo on the filter', () => {
  const r = createRuntime(0)
  grant(r, 5)
  place(
    r,
    belt(13),
    { type: 'placeBuilding', kind: 'filter', gx: 14, gy: 12, dir: 'E' },
    belt(15),
    belt(14, 13),
    belt(14, 11)
  )
  r.tick(applyEdits)
  assert.deepInclude(r.inspect(state).buildings, { kind: 'filter', targetValue: 37 })
  place(r, { type: 'setFilter', gx: 14, gy: 12, targetValue: 0 })
  r.tick(applyEdits)
  for (const [value, destination] of [
    [0, '15,12'],
    [1, '14,13'],
    [2, '14,11'],
    [3, '14,12'],
  ] as const) {
    feed(r, [{ gx: 13, gy: 12, value }])
    advance(r, 42)
    assert.isDefined(r.inspect(state).index.items[destination])
  }
  assert.isTrue(createRuntimeFromSave(exportSave(r)).ok)
  place(r, { type: 'removeBuilding', gx: 14, gy: 12 })
  r.tick(applyEdits)
  assert.isUndefined(r.inspect(state).index.items['14,12'])
})

it('rejects side input on the filter and holds a match until its straight output opens', () => {
  const r = createRuntime(0)
  grant(r, 5)
  place(r, belt(13), { type: 'placeBuilding', kind: 'filter', gx: 14, gy: 12, dir: 'E' }, belt(14, 11), {
    type: 'placeBuilding',
    kind: 'belt',
    gx: 14,
    gy: 13,
    dir: 'N',
  })
  r.tick(applyEdits)
  feed(r, [
    { gx: 14, gy: 13, value: 1 },
    { gx: 13, gy: 12, value: 37 },
  ])
  advance(r, 60)
  assert.sameMembers(Rec.keys(r.inspect(state).index.items), ['14,12', '14,13'])
  place(r, belt(15))
  advance(r, 1)
  assert.sameMembers(Rec.keys(r.inspect(state).index.items), ['15,12', '14,13'])
})

it.each([
  [0, 270],
  [3, 540],
])(
  'accepts beacon fuel from four sides at resonance rank %i, caps it and burns one unit per tick',
  (rank, expected) => {
    const r = createRuntime(0)
    grant(r, 7)
    r.tick(
      Game.Schedule(
        Game.System('Test/Resonance', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) => {
          const p = resources.p.get()
          resources.p.set({
            ...p,
            meta: { ...p.meta, metaUpgrades: { ...p.meta.metaUpgrades, beaconResonance: rank } },
          })
        })
      )
    )
    place(
      r,
      { type: 'placeBuilding', kind: 'beacon', gx: 15, gy: 12, dir: 'N' },
      belt(14),
      { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 12, dir: 'W' },
      { type: 'placeBuilding', kind: 'belt', gx: 15, gy: 11, dir: 'S' },
      { type: 'placeBuilding', kind: 'belt', gx: 15, gy: 13, dir: 'N' }
    )
    r.tick(applyEdits)
    feed(r, [
      { gx: 14, gy: 12, value: 1 },
      { gx: 16, gy: 12, value: 2 },
      { gx: 15, gy: 11, value: 2 },
      { gx: 15, gy: 13, value: 2 },
    ])
    advance(r, 1)
    assert.deepInclude(r.inspect(state).buildings, { kind: 'beacon', fuelTicks: expected })
    assert.sameMembers(Rec.keys(r.inspect(state).index.items), ['14,12'])
    place(r, { type: 'removeBuilding', gx: 14, gy: 12 }, belt(14))
    r.tick(applyEdits)
    feed(r, [{ gx: 14, gy: 12, value: 100 }])
    advance(r, 1)
    assert.deepInclude(r.inspect(state).buildings, { kind: 'beacon', fuelTicks: 1800 })
    advance(r, 1799)
    assert.deepInclude(r.inspect(state).buildings, { kind: 'beacon', fuelTicks: 1 })
    advance(r, 2)
    assert.deepInclude(r.inspect(state).buildings, { kind: 'beacon', fuelTicks: 0 })
  }
)

it('advances the seed, clears the run, pays its mutator and restores the original map on full reset', () => {
  const r = factory()
  advance(r, 10)
  const before = r.inspect(state)
  place(r, { type: 'ascendBoard', mutator: 'primeRush' })
  r.tick(applyEdits)
  assert.deepEqual(r.inspect(state), before)
  grant(r, 11)
  place(
    r,
    { type: 'ascendBoard', mutator: 'primeRush' },
    { type: 'buyMetaUpgrade', upgrade: 'bootstrap' },
    { type: 'buyMetaUpgrade', upgrade: 'veinRichness' }
  )
  r.tick(applyEdits)
  const first = r.inspect(state)
  assert.lengthOf(first.buildings, 4)
  assert.isEmpty(first.tiles)
  assert.deepEqual(first.p.vault, {})
  assert.equal(first.p.milestoneIndex, 0)
  assert.deepEqual(first.p.meta.medals, ['ascended'])
  assert.equal(first.p.meta.totalCoresEarned, 15)
  assert.equal(first.p.meta.cores, 11)
  assert.deepEqual(first.veins, createRuntime(1).inspect(state).veins)
  grant(r, 9)
  place(r, { type: 'ascendBoard', mutator: 'highVelocity' })
  r.tick(applyEdits)
  const next = r.inspect(state)
  assert.deepEqual(next.p.meta.medals, ['ascended', 'primeEngineer'])
  assert.equal(next.p.meta.cores, 19)
  assert.equal(next.p.meta.totalCoresEarned, 23)
  assert.equal(next.p.meta.ascensions, 2)
  assert.equal(next.p.meta.seed, 2)
  assert.equal(next.p.sparks, 50)
  assert.deepEqual(next.p.upgrades, { beltSpeed: 2, extractorSpeed: 2, combinerSpeed: 1, hubValue: 1, surge: 1 })
  const plain = createRuntime(2).inspect(state)
  for (const tier of [0, 1, 2, 3] as const) {
    const count = (cells: typeof next.veins) => Arr.filter(cells, (c) => inBounds(c, tier)).length
    assert.equal(count(next.veins) - count(plain.veins), tier)
  }
  const restored = createRuntimeFromSave(exportSave(r))
  assert.isTrue(restored.ok)
  place(r, { type: 'resetBoard' })
  r.tick(applyEdits)
  assert.deepEqual(r.inspect(state).p, createRuntime(0).inspect(state).p)
  assert.deepEqual(r.inspect(state).veins, before.veins)
})

it('moves cargo and extracts faster in High Velocity', () => {
  const standard = factory()
  const fast = factory()
  fast.tick(
    Game.Schedule(
      Game.System('Test/Velocity', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) => {
        const p = resources.p.get()
        resources.p.set({ ...p, meta: { ...p.meta, mutator: 'highVelocity' } })
      })
    )
  )
  advance(standard, 2)
  advance(fast, 2)
  const base = standard.inspect(state)
  const boosted = fast.inspect(state)
  assert.equal(boosted.tiles[0]?.progress, (base.tiles[0]?.progress ?? 0) * 1.35)
  const baseExtractor = Arr.findFirst(base.buildings, (b) => b.kind === 'extractor')
  const fastExtractor = Arr.findFirst(boosted.buildings, (b) => b.kind === 'extractor')
  assert.isTrue(Option.isSome(baseExtractor) && Option.isSome(fastExtractor))
  if (Option.isSome(baseExtractor) && Option.isSome(fastExtractor)) {
    assert.approximately(
      (fastExtractor.value.remainingTicks + 1) * 1.35,
      baseExtractor.value.remainingTicks + 1,
      0.00001
    )
  }
})

it.each([false, true])('rotates saturated belt junction inputs with rear intake active = %s', (rearActive) => {
  let r = createRuntime(0)
  grant(r, 2)
  const left = { gx: 16, gy: 11, value: 1 }
  const back = { gx: 15, gy: 12, value: 2 }
  const right = { gx: 16, gy: 13, value: 3 }
  place(
    r,
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 12, dir: 'E' },
    { type: 'placeBuilding', kind: 'belt', ...right, dir: 'N' },
    belt(back.gx),
    { type: 'placeBuilding', kind: 'belt', ...left, dir: 'S' }
  )
  r.tick(applyEdits)
  const ports = rearActive ? [left, back, right] : [left, right]
  feed(r, Arr.reverse(ports))
  for (const [i, source] of [...ports, ...ports].entries()) {
    advance(r, i === 0 ? 1 : 40)
    const { index } = r.inspect(state)
    assert.isUndefined(index.items[`${source.gx},${source.gy}`])
    assert.isDefined(index.items['16,12'])
    feed(r, [source])
    const saved = createRuntimeFromSave(exportSave(r))
    assert.isTrue(saved.ok)
    if (saved.ok) {
      r = saved.value
    }
  }
})

it('stores 24 matching values, blocks other values and drains one item per belt interval into an open hub', () => {
  const r = createRuntime(0)
  grant(r, 5)
  const source = { gx: 16, gy: 11, value: 3 }
  const other = { gx: 15, gy: 12, value: 7 }
  place(
    r,
    { type: 'placeBuilding', kind: 'buffer', gx: 16, gy: 12, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', ...source, dir: 'S' },
    belt(other.gx)
  )
  r.tick(applyEdits)
  const buffer = () => Arr.findFirst(r.inspect(state).buildings, (b) => b.kind === 'buffer')
  for (let count = 1; count <= 24; count++) {
    feed(r, [source])
    advance(r, 1)
    assert.deepEqual(buffer(), Option.some({ kind: 'buffer', storedValue: Option.some(3), count }))
    if (count === 1) {
      feed(r, [other])
    }
  }
  feed(r, [source])
  advance(r, 2)
  assert.isDefined(r.inspect(state).index.items['16,11'])
  assert.isDefined(r.inspect(state).index.items['15,12'])
  const save = createRuntimeFromSave(exportSave(r))
  assert.isTrue(save.ok)
  if (save.ok) {
    assert.deepEqual(save.value.inspect(state).buildings, r.inspect(state).buildings)
  }
  place(r, { type: 'removeBuilding', ...source })
  for (let i = 0; i < 3; i++) {
    place(r, { type: 'rotateBuilding', gx: 16, gy: 12 })
  }
  advance(r, 40)
  assert.equal(r.inspect(state).p.totalDelivered, 1)
  const resumed = createRuntimeFromSave(exportSave(r))
  assert.isTrue(resumed.ok)
  if (resumed.ok) {
    advance(resumed.value, 1)
    assert.equal(resumed.value.inspect(state).p.totalDelivered, 2)
  }
  advance(r, 1 + 22 * 40)
  assert.equal(r.inspect(state).p.totalDelivered, 24)
  assert.deepEqual(buffer(), Option.some({ kind: 'buffer', storedValue: Option.some(7), count: 1, cooldownTicks: 40 }))
  advance(r, 40)
  assert.deepEqual(
    buffer(),
    Option.some({ kind: 'buffer', storedValue: Option.none<number>(), count: 0, cooldownTicks: 40 })
  )
})

it('gives a direct extractor and a waiting belt alternating belt junction turns', () => {
  const r = createRuntime(0)
  grant(r)
  place(
    r,
    extractor,
    { type: 'placeBuilding', kind: 'belt', gx: 14, gy: 12, dir: 'N' },
    { type: 'placeBuilding', kind: 'trash', gx: 14, gy: 11, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', gx: 14, gy: 13, dir: 'N' }
  )
  r.tick(applyEdits)
  const source = { gx: 14, gy: 13, value: 7 }
  feed(r, [source])
  advance(r, 1)
  for (const side of ['W', 'S', 'W', 'S']) {
    const snapshot = r.inspect(state)
    assert.equal(Option.getOrUndefined(Arr.findFirst(snapshot.tiles, (t) => t.gx === 14 && t.gy === 12))?.fromDir, side)
    if (side === 'S') {
      feed(r, [source])
    }
    advance(r, 40)
  }
})

it.each([0, 1, 19])('finds a legal recipe for each Prime Rush target on seed %i', (seed) => {
  const { p, veins } = createRuntime(seed).inspect(state)
  for (let index = 3; index <= 10; index++) {
    const tier = index < 4 ? 1 : index < 6 ? 2 : 3
    const ores = Arr.map(Arr.filter(veins, inBounds(tier)), (vein) => vein.value)
    const ops = Arr.filter(['add', 'mul', 'sub', 'div'] as const, (op) => toolUnlock[op] <= index)
    const target = milestoneFor({ ...p, milestoneIndex: index, meta: { ...p.meta, mutator: 'primeRush' } })
      .requirements[0]
    assert.isDefined(target)
    if (target !== undefined) {
      assert.isNotEmpty(suggestRecipe(target.value, ores, ops), 'M' + (index + 1) + ' target ' + target.value)
    }
  }
})
