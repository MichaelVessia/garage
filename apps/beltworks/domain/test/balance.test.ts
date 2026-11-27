import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import {
  Building,
  Game,
  Progression,
  applyEdits,
  coresEarned,
  milestoneFor,
  createRuntime,
  createRuntimeFromSave,
  exportSave,
  sideContract,
  upgradeCost,
} from '../src/index.ts'
import type { Runtime } from '../src/index.ts'
import { layout } from './balance-layouts.ts'
import { fixtures } from './fixtures.ts'

const { advance, belt, extractor, feed, place } = fixtures

const progress = Game.Inspector(
  'Test/Balance',
  { resources: { p: Game.System.readResource(Progression) } },
  ({ resources }) => resources.p.get()
)
type Progress = ReturnType<typeof readProgress>
function readProgress(r: Runtime) {
  return r.inspect(progress)
}
function setProgress(r: Runtime, patch: Partial<Progress>) {
  r.tick(
    Game.Schedule(
      Game.System('Test/BalanceSetup', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) =>
        resources.p.set({ ...resources.p.get(), ...patch })
      )
    )
  )
}
function hubLine(milestoneIndex: number) {
  const r = createRuntime(0)
  setProgress(r, { milestoneIndex })
  place(r, belt(16))
  r.tick(applyEdits)
  return r
}
function deliver(r: Runtime, value: number, count = 1) {
  for (let i = 0; i < count; i++) {
    feed(r, [{ gx: 16, gy: 12, value }])
    advance(r, 1)
  }
}

it('holds a filled quota until the 25th recent delivery and completes on that tick', () => {
  const r = hubLine(3)
  deliver(r, 12, 139)
  advance(r, 3600)
  deliver(r, 12, 24)
  const p = readProgress(r)
  assert.equal(p.milestoneIndex, 3)
  assert.isAtLeast(p.delivered[12] ?? 0, 140)
  assert.equal(p.rateByValue[12], 24)
  deliver(r, 12)
  assert.equal(readProgress(r).milestoneIndex, 4)
})

it.each([
  [6, 48, 500, 12, 300],
  [7, 72, 700, 24, 400],
  [8, 96, 1000, 37, 500],
])('requires both orders for milestone index %i', (index, value, quota, secondary, secondaryQuota) => {
  const r = hubLine(index)
  deliver(r, secondary, secondaryQuota - 1)
  deliver(r, value, quota)
  assert.equal(readProgress(r).milestoneIndex, index)
  deliver(r, secondary)
  assert.equal(readProgress(r).milestoneIndex, index + 1)
})

it('keeps the fastest M8 finish across ascensions and clears it on reset', () => {
  const r = hubLine(7)
  for (const [ticks, best] of [
    [900, 900],
    [1200, 900],
    [720, 720],
  ] as const) {
    setProgress(r, {
      milestoneIndex: 7,
      runTicks: ticks - 1,
      delivered: { 72: 699, 24: 400 },
      rateByValue: { 72: 89, 24: 45 },
    })
    place(r, belt(16))
    r.tick(applyEdits)
    deliver(r, 72)
    assert.equal(readProgress(r).runTicks, ticks)
    assert.deepEqual(readProgress(r).meta.bestRunTicks, Option.some(best))
    place(r, { type: 'ascendBoard', mutator: 'standard' })
    r.tick(applyEdits)
    assert.equal(readProgress(r).runTicks, 0)
    assert.deepEqual(readProgress(r).meta.bestRunTicks, Option.some(best))
  }
  place(r, { type: 'resetBoard' })
  r.tick(applyEdits)
  assert.deepEqual(readProgress(r).meta.bestRunTicks, Option.none())
})

it('pays the contract bonus and rotates the contract on its last delivery', () => {
  const r = hubLine(2)
  const offer = sideContract(0, 0)
  deliver(r, offer.value)
  assert.equal(readProgress(r).contractDelivered, 0)
  setProgress(r, { milestoneIndex: 3 })
  deliver(r, offer.value, offer.quota - 1)
  const before = readProgress(r)
  assert.equal(before.contractIndex, 0)
  assert.equal(before.contractDelivered, offer.quota - 1)
  deliver(r, offer.value)
  const after = readProgress(r)
  assert.equal(after.contractIndex, 1)
  assert.equal(after.contractDelivered, 0)
  assert.equal(after.sparks - before.sparks, offer.sparks + 1)
  assert.equal(after.vault[offer.value], (before.vault[offer.value] ?? 0) + 1 + offer.stock)
  const next = sideContract(0, 1)
  assert.notEqual(next.value, offer.value)
  deliver(r, offer.value)
  assert.equal(readProgress(r).contractDelivered, 0)
  deliver(r, next.value)
  assert.equal(readProgress(r).contractDelivered, 1)
})

it('requires ones from the starter line for a level five speed purchase', () => {
  const r = hubLine(6)
  const cost = upgradeCost(4)
  assert.isAbove(cost.stock[1] ?? 0, 0)
  assert.isAbove(cost.stock[7] ?? 0, 0)
  const vault = { ...cost.stock, 1: (cost.stock[1] ?? 0) - 1 }
  setProgress(r, { sparks: cost.sparks, vault, upgrades: { ...readProgress(r).upgrades, beltSpeed: 4 } })
  const buy = () => {
    place(r, { type: 'buyUpgrade', upgrade: 'beltSpeed' })
    r.tick(applyEdits)
  }
  buy()
  assert.equal(readProgress(r).upgrades.beltSpeed, 4)
  assert.equal(readProgress(r).sparks, cost.sparks)
  assert.deepEqual(readProgress(r).vault, vault)
  deliver(r, 1)
  buy()
  assert.equal(readProgress(r).upgrades.beltSpeed, 5)
  assert.equal(readProgress(r).sparks, 1)
  assert.equal(readProgress(r).vault[1] ?? 0, 0)
  assert.equal(readProgress(r).vault[7] ?? 0, 0)
})

it('runs a working adder for 20,000 ticks and resumes production deterministically', () => {
  const r = createRuntime(0)
  setProgress(r, { milestoneIndex: 1 })
  place(
    r,
    { ...extractor, dir: 'N' },
    belt(13, 11),
    belt(14, 11),
    { ...extractor, gx: 21, gy: 13, dir: 'N' },
    { type: 'placeBuilding', kind: 'belt', gx: 21, gy: 12, dir: 'N' },
    { type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 15, gy: 11, dir: 'S' },
    belt(15),
    belt(16)
  )
  for (let gx = 21; gx >= 16; gx--) {
    place(r, { type: 'placeBuilding', kind: 'belt', gx, gy: 11, dir: 'W' })
  }
  advance(r, 19_000)
  const before = readProgress(r).totalDelivered
  const restored = createRuntimeFromSave(exportSave(r))
  if (!restored.ok) {
    throw new Error('Could not restore running factory')
  }
  advance(r, 1000)
  advance(restored.value, 1000)
  assert.isAbove(readProgress(r).totalDelivered, before)
  assert.isAbove(readProgress(r).vault[3] ?? 0, 200)
  assert.deepEqual(exportSave(r), exportSave(restored.value))
})

it('applies surge on every third extraction and retains its count across a save', () => {
  const r = fixtures.factory()
  setProgress(r, { milestoneIndex: 6, upgrades: { ...readProgress(r).upgrades, beltSpeed: 15, surge: 10 } })
  advance(r, 3600)
  const p = readProgress(r)
  assert.equal(p.vault[1], 80)
  const restored = createRuntimeFromSave(exportSave(r))
  if (!restored.ok) {
    throw new Error('Invalid surge save')
  }
  advance(r, 360)
  advance(restored.value, 360)
  assert.deepEqual(exportSave(r), exportSave(restored.value))
})

it('adds mastery to passive income, including fractional Sparks', () => {
  const r = hubLine(10)
  deliver(r, 1, 20)
  assert.equal(readProgress(r).sparks, 39)
})

it.each([
  [6, 48, 30, 12, 35],
  [7, 72, 90, 24, 45],
  [8, 96, 120, 37, 60],
  [9, 128, 150, 48, 75],
  [10, 144, 165, 72, 85],
])(
  'requires both recent rates at index %i after both quotas are filled',
  (index, primary, first, secondary, second) => {
    const r = hubLine(index)
    setProgress(r, { delivered: { [primary]: 10_000, [secondary]: 10_000 } })
    deliver(r, secondary, second)
    deliver(r, primary, first - 1)
    assert.equal(readProgress(r).milestoneIndex, index)
    advance(r, 3600)
    deliver(r, primary, first)
    deliver(r, secondary, second - 1)
    assert.equal(readProgress(r).milestoneIndex, index)
    deliver(r, secondary)
    assert.equal(readProgress(r).milestoneIndex, index + 1)
  }
)

it.each([
  [0, 0, 10],
  [1, 0, 15],
  [2, 0, 20],
  [3, 0, 20],
  [3, 1, 25],
  [0, 2, 15],
])('delivers boosted extractor output with %i nearby beacons and resonance rank %i', (count, rank, expected) => {
  const r = createRuntime(0)
  setProgress(r, { milestoneIndex: 7, upgrades: { ...readProgress(r).upgrades, beltSpeed: 15 } })
  const meta = readProgress(r).meta
  setProgress(r, { meta: { ...meta, metaUpgrades: { ...meta.metaUpgrades, beaconResonance: rank } } })
  // The last beacon is three cells from the extractor.
  const cells = [
    ...[
      { gx: 12, gy: 10 },
      { gx: 15, gy: 10 },
      { gx: 14, gy: 14 },
    ].slice(0, count),
    { gx: 16, gy: 15 },
  ]
  for (const cell of cells) {
    place(
      r,
      { type: 'placeBuilding', kind: 'beacon', dir: 'N', ...cell },
      { type: 'placeBuilding', kind: 'belt', dir: 'N', gx: cell.gx, gy: cell.gy + 1 }
    )
  }
  r.tick(applyEdits)
  feed(
    r,
    Arr.map(cells, (cell) => ({ gx: cell.gx, gy: cell.gy + 1, value: 40 }))
  )
  advance(r, 1)
  place(r, extractor, belt(14), belt(15), belt(16))
  advance(r, 480)
  assert.equal(readProgress(r).totalDelivered, expected)
  assert.equal(readProgress(r).meta.medals.includes('overclocked'), count >= 2)
  for (const cell of cells) {
    place(r, { type: 'removeBuilding', ...cell })
  }
  advance(r, 480)
  assert.equal(readProgress(r).totalDelivered, expected + 10)
})

it.each([
  [0, 37],
  [1, 25],
  [2, 19],
])('delivers a crafted item after the boosted period with %i beacons', (count, ticks) => {
  const r = hubLine(7)
  place(
    r,
    { type: 'removeBuilding', gx: 16, gy: 12 },
    { type: 'placeBuilding', kind: 'combiner', op: 'add', dir: 'E', gx: 16, gy: 12 },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 11, dir: 'S' },
    { type: 'placeBuilding', kind: 'belt', gx: 16, gy: 13, dir: 'N' }
  )
  const cells = [
    { gx: 14, gy: 10 },
    { gx: 18, gy: 10 },
  ].slice(0, count)
  for (const cell of cells) {
    place(r, { type: 'placeBuilding', kind: 'beacon', dir: 'W', ...cell }, belt(cell.gx - 1, cell.gy))
  }
  r.tick(applyEdits)
  feed(r, [
    ...Arr.map(cells, (cell) => ({ gx: cell.gx - 1, gy: cell.gy, value: 2 })),
    { gx: 16, gy: 11, value: 3 },
    { gx: 16, gy: 13, value: 4 },
  ])
  advance(r, ticks)
  assert.equal(readProgress(r).totalDelivered, 0)
  advance(r, 1)
  assert.equal(readProgress(r).vault[7], 1)
  assert.equal(readProgress(r).meta.medals.includes('overclocked'), count >= 2)
})

it('resumes a fueled beacon and returns to normal extraction when its fuel runs out', () => {
  const r = fixtures.factory()
  setProgress(r, { milestoneIndex: 7, upgrades: { ...readProgress(r).upgrades, beltSpeed: 15 } })
  place(r, { type: 'placeBuilding', kind: 'beacon', gx: 14, gy: 10, dir: 'E' }, belt(13, 10))
  r.tick(applyEdits)
  feed(r, [{ gx: 13, gy: 10, value: 2 }])
  advance(r, 1)
  const saved = createRuntimeFromSave(exportSave(r))
  if (!saved.ok) {
    throw new Error('Could not restore fueled beacon')
  }
  for (const runtime of [r, saved.value]) {
    advance(runtime, 480)
    assert.equal(readProgress(runtime).totalDelivered, 11)
    advance(runtime, 480)
    assert.equal(readProgress(runtime).totalDelivered, 21)
  }
  assert.deepEqual(exportSave(r), exportSave(saved.value))
})

it('requires fresh deliveries of both targets after removing a production line', () => {
  const r = hubLine(6)
  deliver(r, 48, 500)
  place(r, { type: 'removeBuilding', gx: 16, gy: 12 }, belt(16))
  r.tick(applyEdits)
  deliver(r, 12, 300)
  assert.equal(readProgress(r).delivered[48], 500)
  assert.equal(readProgress(r).rateByValue[48], 500)
  assert.equal(readProgress(r).milestoneIndex, 6)
  deliver(r, 48, 29)
  assert.equal(readProgress(r).milestoneIndex, 6)
  deliver(r, 48)
  assert.equal(readProgress(r).milestoneIndex, 7)
})

it('pays the stated Core awards and rejects purchases with insufficient Cores or a full rank', () => {
  assert.deepEqual(
    Arr.map([7, 8, 9, 10, 11], (i) => coresEarned(i, 'standard')),
    [0, 3, 6, 10, 15]
  )
  assert.deepEqual(
    Arr.map([8, 9, 10, 11], (i) => coresEarned(i, 'highVelocity')),
    [4, 8, 13, 20]
  )
  const r = createRuntime(0)
  const buy = { type: 'buyMetaUpgrade', upgrade: 'bootstrap' } as const
  place(r, buy)
  r.tick(applyEdits)
  assert.equal(readProgress(r).meta.metaUpgrades.bootstrap, 0)
  setProgress(r, { meta: { ...readProgress(r).meta, cores: 100 } })
  for (let rank = 0; rank < 6; rank++) {
    place(r, buy)
  }
  r.tick(applyEdits)
  assert.equal(readProgress(r).meta.metaUpgrades.bootstrap, 5)
  assert.equal(readProgress(r).meta.cores, 70)
})

it('uses prime targets for deliveries and higher rate gates in High Velocity', () => {
  const r = hubLine(3)
  const meta = readProgress(r).meta
  setProgress(r, { meta: { ...meta, mutator: 'primeRush' } })
  assert.deepEqual(
    Arr.map(
      [3, 4, 5, 6, 7, 8],
      (milestoneIndex) => milestoneFor({ ...readProgress(r), milestoneIndex }).requirements[0]?.value
    ),
    [11, 19, 29, 41, 59, 83]
  )
  deliver(r, 12)
  assert.isUndefined(readProgress(r).delivered[12])
  deliver(r, 11, 140)
  assert.equal(readProgress(r).milestoneIndex, 4)
  setProgress(r, {
    meta: { ...meta, mutator: 'highVelocity' },
    milestoneIndex: 3,
    delivered: { 12: 140 },
    rateByValue: {},
    deliveryWindow: [],
  })
  deliver(r, 12, 37)
  assert.equal(readProgress(r).milestoneIndex, 3)
  deliver(r, 12)
  assert.equal(readProgress(r).milestoneIndex, 4)
})

it('adds fractional mastery income and scales both contract jackpots', () => {
  const r = hubLine(3)
  const meta = readProgress(r).meta
  setProgress(r, { meta: { ...meta, metaUpgrades: { ...meta.metaUpgrades, masterySynergy: 1, contractMastery: 2 } } })
  const offer = sideContract(0, 0)
  deliver(r, offer.value, offer.quota)
  const p = readProgress(r)
  assert.equal(p.sparks, 54 + offer.sparks * 1.8)
  assert.equal(p.vault[offer.value], 54 + offer.stock * 1.8)
  assert.equal(p.rateByValue[offer.value], 40)
})

it('awards medals at the third active line and the combined mission rate', () => {
  const r = hubLine(6)
  deliver(r, 48, 75)
  deliver(r, 12, 74)
  deliver(r, 2, 10)
  deliver(r, 1, 9)
  assert.deepEqual(readProgress(r).meta.medals, [])
  deliver(r, 1)
  assert.deepEqual(readProgress(r).meta.medals, ['multiLine'])
  deliver(r, 12)
  assert.deepEqual(readProgress(r).meta.medals, ['multiLine', 'throughputTitan'])
  const before = readProgress(r)
  deliver(r, 1, 100)
  assert.equal(readProgress(r).sparks - before.sparks, 106)
})

it('counts only buildings placed in one blueprint stamp', () => {
  const r = hubLine(0)
  const entries = Arr.makeBy(6, (dx) => ({ dx, dy: 0, kind: 'belt' as const, dir: 'E' as const }))
  const stamp = { type: 'stampBlueprint' as const, originX: 13, originY: 12, entries }
  place(r, stamp)
  r.tick(applyEdits)
  assert.deepEqual(readProgress(r).meta.medals, [])
  place(r, { ...stamp, originY: 10 })
  r.tick(applyEdits)
  assert.deepEqual(readProgress(r).meta.medals, ['blueprintArchitect'])
})

const hasFueledBeacon = Game.Inspector(
  'Test/HasFueledBeacon',
  { queries: { machines: Game.Query({ selection: { building: Game.Query.read(Building) } }) } },
  ({ queries: { machines } }) =>
    Arr.some(machines.each(), (entity) => {
      const building = machines.data.building.get(entity)
      return building.kind === 'beacon' && building.fuelTicks > 0
    })
)
const modes = ['standard', 'primeRush', 'highVelocity'] as const
it.effect.each(modes)(
  'benchmarks a full %s run',
  (mutator) =>
    Effect.gen(function* () {
      const r = createRuntime(0)
      setProgress(r, { meta: { ...readProgress(r).meta, mutator } })
      let ticks = 0
      function build(name: Parameters<typeof layout>[0]) {
        place(r, ...layout(name))
        r.tick(applyEdits)
      }
      function runUntil(done: (p: Progress) => boolean) {
        const start = ticks
        while (!done(readProgress(r))) {
          if (ticks - start > 100_000) {
            throw new Error('Factory stalled at M' + (readProgress(r).milestoneIndex + 1))
          }
          advance(r, 1)
          ticks++
        }
      }
      function stock(value: number, units: number, name: Parameters<typeof layout>[0]) {
        if ((readProgress(r).vault[value] ?? 0) < units) {
          build(name)
          runUntil((p) => (p.vault[value] ?? 0) >= units)
        }
      }
      function upgrade(level: number) {
        for (const upgrade of ['beltSpeed', 'extractorSpeed', 'combinerSpeed'] as const) {
          place(r, { type: 'buyUpgrade', upgrade })
          r.tick(applyEdits)
          assert.equal(readProgress(r).upgrades[upgrade], level)
        }
      }
      function expand(tier: number) {
        place(r, { type: 'expandBoard' })
        r.tick(applyEdits)
        assert.equal(readProgress(r).boardTier, tier)
      }
      const prime = mutator === 'primeRush'
      const missions = [
        'one',
        'three',
        'seven',
        prime ? 'eleven' : 'twelve',
        prime ? 'nineteen' : 'twentyFour',
        prime ? 'twentyNine' : 'thirtySeven',
        prime ? 'fortyOne' : 'fortyEight',
        prime ? 'fiftyNine' : 'seventyTwo',
        prime ? 'eightyThree' : 'ninetySix',
        prime ? 'elevenAgain' : 'oneTwentyEight',
        prime ? 'nineteenAgain' : 'oneFortyFour',
      ] as const
      const results: Array<{
        milestone: number
        ticks: number
        stageTicks: number
        minutes: number
        cores: number
        coresPerMinute: number
      }> = []
      for (const [index, mission] of missions.entries()) {
        const start = ticks
        if (index === 2) {
          expand(1)
          upgrade(2)
        }
        if (index === 4) {
          expand(2)
          stock(3, 60, 'three')
          upgrade(3)
        }
        if (index === 6) {
          stock(12, 120, 'twelve')
          stock(24, 80, 'twentyFour')
          expand(3)
          stock(7, 135, 'seven')
          upgrade(4)
        }
        build(mission)
        runUntil((p) => p.milestoneIndex === index + 1)
        let cores = 0
        if (index >= 7) {
          assert.isTrue(r.inspect(hasFueledBeacon), mission)
          const checkpoint = createRuntimeFromSave(exportSave(r))
          if (!checkpoint.ok) {
            throw new Error('Invalid milestone checkpoint')
          }
          place(checkpoint.value, { type: 'ascendBoard', mutator: 'standard' })
          checkpoint.value.tick(applyEdits)
          cores = readProgress(checkpoint.value).meta.cores
        }
        results.push({
          milestone: index + 1,
          ticks,
          stageTicks: ticks - start,
          minutes: (ticks - start) / 3600,
          cores,
          coresPerMinute: (cores * 3600) / ticks,
        })
      }
      if (prime) {
        assert.isAtLeast(results[6]?.minutes ?? 0, 4.2)
        assert.isAtMost(results[6]?.minutes ?? Infinity, 5)
      }
      yield* Console.table(results).pipe(Effect.provideService(Console.Console, Console.Console.defaultValue()))
      assert.lengthOf(results, 11)
      let previous = 0
      for (const row of results.slice(7)) {
        assert.isAbove(row.coresPerMinute, previous, mutator + ' M' + row.milestone)
        previous = row.coresPerMinute
      }
    }),
  180_000
)
