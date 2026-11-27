import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'

import {
  Game,
  Progression,
  applyEdits,
  createRuntime,
  createRuntimeFromSave,
  exportSave,
  sideContract,
  upgradeCost,
} from '../src/index.ts'
import type { Runtime } from '../src/index.ts'
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
  [0, 10],
  [1, 15],
  [2, 20],
  [3, 20],
])('delivers boosted extractor output with %i nearby beacons', (count, expected) => {
  const r = createRuntime(0)
  setProgress(r, { milestoneIndex: 7, upgrades: { ...readProgress(r).upgrades, beltSpeed: 15 } })
  // The fourth beacon is outside the extractor's range.
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
