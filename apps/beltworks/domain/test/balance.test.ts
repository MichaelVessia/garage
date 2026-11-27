import { assert, it } from '@effect/vitest'

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
  const r = hubLine(1)
  const offer = sideContract(0, 0)
  deliver(r, offer.value)
  assert.equal(readProgress(r).contractDelivered, 0)
  setProgress(r, { milestoneIndex: 2 })
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
