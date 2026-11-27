import * as Arr from 'effect/Array'
import * as Fn from 'effect/Function'
import * as Rec from 'effect/Record'

import type { BoardTier, initial, MetaUpgradeKey, Mutator, Upgrade } from './model.ts'

type State = typeof initial
type Requirement = { readonly value: number; readonly quota: number; readonly minRatePerMin?: number }
type Mission = { readonly requirements: ReadonlyArray<Requirement>; readonly reward: string }
const missions: ReadonlyArray<Mission> = [
  { requirements: [{ value: 1, quota: 15 }], reward: 'Adder & speed upgrades' },
  { requirements: [{ value: 3, quota: 35 }], reward: 'Splitter, Merger, Hub amplifier & Ring 1' },
  { requirements: [{ value: 7, quota: 75 }], reward: 'Tunnel, contracts & extractor surge' },
  { requirements: [{ value: 12, quota: 140, minRatePerMin: 25 }], reward: 'Multiplier & Ring 2' },
  { requirements: [{ value: 24, quota: 260, minRatePerMin: 45 }], reward: 'Filter & Buffer' },
  { requirements: [{ value: 37, quota: 420, minRatePerMin: 60 }], reward: 'Subtractor, Trash & Full Foundry' },
  {
    requirements: [
      { value: 48, quota: 500, minRatePerMin: 30 },
      { value: 12, quota: 300, minRatePerMin: 35 },
    ],
    reward: 'Beacon & +25% foundry efficiency',
  },
  {
    requirements: [
      { value: 72, quota: 700, minRatePerMin: 90 },
      { value: 24, quota: 400, minRatePerMin: 45 },
    ],
    reward: 'Divider, ascension & +25% foundry efficiency',
  },
  {
    requirements: [
      { value: 96, quota: 1000, minRatePerMin: 120 },
      { value: 37, quota: 500, minRatePerMin: 60 },
    ],
    reward: '+30% foundry efficiency',
  },
]
export function milestone(index: number): Mission {
  const fixed = missions[index]
  if (fixed !== undefined) {
    return fixed
  }
  const n = index - 9
  return {
    requirements: [
      { value: [128, 144][n] ?? 180 + 36 * (n - 2), quota: 1300 + 350 * n, minRatePerMin: Math.min(900, 150 + 15 * n) },
      { value: [48, 72, 96][n % 3] ?? 48, quota: 600 + 100 * n, minRatePerMin: Math.min(400, 75 + 10 * n) },
    ],
    reward: '+15% Sparks & speed',
  }
}
const primes = [11, 19, 29, 41, 59, 83]
export function milestoneFor(p: State): Mission {
  const mission = milestone(p.milestoneIndex)
  if (p.meta.mutator === 'standard') {
    return mission
  }
  const prime = primes[(p.milestoneIndex - 3) % primes.length]
  const requirements = Arr.map(mission.requirements, (r, i) => {
    if (p.meta.mutator === 'highVelocity' && r.minRatePerMin !== undefined) {
      return { ...r, minRatePerMin: Math.ceil(r.minRatePerMin * 1.5) }
    }
    return p.meta.mutator === 'primeRush' && p.milestoneIndex >= 3 && i === 0 && prime !== undefined
      ? { ...r, value: prime }
      : r
  })
  return { ...mission, requirements }
}
export const coresEarned: {
  (index: number, mutator: Mutator): number
  (mutator: Mutator): (index: number) => number
} = Fn.dual(2, (index: number, mutator: Mutator) => {
  if (index < 8) {
    return 0
  }
  const n = index - 8
  const cores = ((n + 2) * (n + 3)) / 2
  return mutator === 'standard' ? cores : Math.ceil((cores * 13) / 10)
})
export const metaUpgradeCost: {
  (key: MetaUpgradeKey, rank: number): number
  (rank: number): (key: MetaUpgradeKey) => number
} = Fn.dual(2, (key: MetaUpgradeKey, rank: number) => {
  const base = { bootstrap: 2, masterySynergy: 3, beaconResonance: 3, veinRichness: 2, contractMastery: 2 }[key]
  return base * (rank + 1)
})
export const productionSpeed = (p: State) =>
  efficiency(p.milestoneIndex) * (p.meta.mutator === 'highVelocity' ? 1.35 : 1)
export const efficiency = (index: number) =>
  1 + Number(index >= 7) * 0.25 + Number(index >= 8) * 0.25 + Number(index >= 9) * 0.3 + Math.max(0, index - 9) * 0.15
export const beltRate = (level: number) => 25 + 12.5 * (level - 1)
export const extractorPeriod = (level: number) => 60 / (1 + 0.5 * (level - 1))
export const craftPeriod = (level: number) => 60 / (1.3 + (8.7 / 14) * (level - 1))
export const amplifier = (level: number) => [1, 1.4, 1.9, 2.6, 3.5, 4.6, 6, 7.8, 10, 13][level - 1] ?? 13
export const surgeInterval = (level: number) => [Infinity, 12, 10, 9, 8, 7, 6, 5, 4, 3][level - 1] ?? 3
export const upgradeLimit = (id: Upgrade) => (id === 'hubValue' || id === 'surge' ? 10 : 15)
export const upgradeUnlock = (id: Upgrade) =>
  ({ hubValue: 2, surge: 3, beltSpeed: 1, extractorSpeed: 1, combinerSpeed: 1 })[id]
type Cost = { sparks: number; stock: Readonly<Record<string, number>> }
export function upgradeCost(level: number): Cost {
  const value = [1, 3, 7, 7, 12, 12, 24, 24, 37, 37, 48, 48, 72, 72][level - 1] ?? 72
  const stock = { [value]: 5 * level * level }
  if (level >= 4) {
    stock[1] = 10 * level
  }
  return { sparks: 10 * level ** 3, stock }
}
export const expansionCost = (level: BoardTier): Cost =>
  [
    { sparks: 35, stock: { 3: 25 } },
    { sparks: 180, stock: { 7: 60 } },
    { sparks: 650, stock: { 12: 120, 24: 80 } },
  ][level] ?? { sparks: Infinity, stock: {} }
export const expansionUnlock = (level: BoardTier) => [2, 4, 6][level] ?? Infinity
export const canAfford: { (p: State, c: Cost): boolean; (c: Cost): (p: State) => boolean } = Fn.dual(
  2,
  (p: State, c: Cost) => p.sparks >= c.sparks && Arr.every(Rec.toEntries(c.stock), ([v, n]) => (p.vault[v] ?? 0) >= n)
)
export function pay({ p, cost: c }: { p: State; cost: Cost }) {
  const vault = { ...p.vault }
  for (const [v, n] of Rec.toEntries(c.stock)) {
    vault[v] = (vault[v] ?? 0) - n
  }
  return { ...p, sparks: p.sparks - c.sparks, vault }
}
const bounties = [6, 9, 15, 18, 28, 3, 7, 12]
type Contract = { value: number; quota: number; sparks: number; stock: number }
export const sideContract: { (seed: number, index: number): Contract; (index: number): (seed: number) => Contract } =
  Fn.dual(2, (seed: number, index: number) => {
    const slot = ((seed >>> 0) + index * 3) % bounties.length
    const quota = 40 + 20 * slot
    return { value: bounties[slot] ?? 6, quota, sparks: quota * 8, stock: Math.ceil(quota / 4) }
  })
export function expireDeliveries({ p, tick }: { p: State; tick: number }): State {
  let expired = 0
  while ((p.deliveryWindow[expired]?.tick ?? Infinity) <= tick - 3600) {
    expired++
  }
  if (expired === 0) {
    return p
  }
  const rateByValue = { ...p.rateByValue }
  for (const entry of p.deliveryWindow.slice(0, expired)) {
    rateByValue[entry.value] = (rateByValue[entry.value] ?? 1) - 1
  }
  return { ...p, rateByValue, deliveryWindow: p.deliveryWindow.slice(expired) }
}
export const landmarks = [1, 3, 7, 12, 24, 37, 48, 72, 96, 128]
export function missionRate({ p, value }: { p: State; value: number }) {
  const start = p.missionRateStart ?? 0
  if (start <= (p.deliveryWindow[0]?.tick ?? Infinity)) {
    return p.rateByValue[value] ?? 0
  }
  let count = 0
  for (const delivery of p.deliveryWindow) {
    if (delivery.value === value && delivery.tick >= start) {
      count++
    }
  }
  return count
}
export const medalSparkMultiplier = (p: State) => 1 + 0.03 * p.meta.medals.length
export function deliver({ previous, value, tick }: { previous: State; value: number; tick: number }) {
  const p = expireDeliveries({ p: previous, tick })
  const mission = milestoneFor(p)
  const matchedTarget = Arr.some(mission.requirements, (r) => r.value === value)
  const contract = sideContract(p.meta.seed, p.contractIndex)
  const side = p.milestoneIndex >= 3 && value === contract.value
  const tracked = matchedTarget || side || Arr.contains(landmarks, value)
  const rateByValue = tracked ? { ...p.rateByValue, [value]: (p.rateByValue[value] ?? 0) + 1 } : p.rateByValue
  const delivered = matchedTarget ? { ...p.delivered, [value]: (p.delivered[value] ?? 0) + 1 } : p.delivered
  const complete =
    matchedTarget &&
    Arr.every(
      mission.requirements,
      (r) =>
        (delivered[r.value] ?? 0) >= r.quota &&
        missionRate({ p, value: r.value }) + Number(r.value === value) >= (r.minRatePerMin ?? 0)
    )
  const paid = side && p.contractDelivered + 1 >= contract.quota
  const base = matchedTarget ? value * amplifier(p.upgrades.hubValue) : Number(tracked)
  const jackpot = 1 + 0.4 * p.meta.metaUpgrades.contractMastery
  const contractSparks = paid ? Math.round(contract.sparks * jackpot) : 0
  const cents =
    p.sparkCents +
    Math.round(
      100 *
        (contractSparks + efficiency(p.milestoneIndex) * base * (1 + 0.35 * p.meta.metaUpgrades.masterySynergy)) *
        medalSparkMultiplier(p)
    )
  const sparksEarned = Math.floor(cents / 100)
  const extraStockCents = (p.vaultRemainders[value] ?? 0) + 35 * p.meta.metaUpgrades.masterySynergy
  const next: State = {
    ...p,
    sparkCents: cents % 100,
    totalDelivered: p.totalDelivered + 1,
    sparks: p.sparks + sparksEarned,
    delivered: complete ? {} : delivered,
    milestoneIndex: p.milestoneIndex + Number(complete),
    vaultRemainders:
      tracked && p.meta.metaUpgrades.masterySynergy > 0
        ? { ...p.vaultRemainders, [value]: extraStockCents % 100 }
        : p.vaultRemainders,
    vault: tracked
      ? {
          ...p.vault,
          [value]:
            (p.vault[value] ?? 0) +
            1 +
            Math.floor(extraStockCents / 100) +
            (paid ? Math.round(contract.stock * jackpot) : 0),
        }
      : p.vault,
    contractDelivered: paid ? 0 : p.contractDelivered + Number(side),
    contractIndex: p.contractIndex + Number(paid),
    rateByValue,
    deliveryWindow: tracked ? [...p.deliveryWindow, { tick, value }] : p.deliveryWindow,
  }
  return { next, complete, matchedTarget, sparksEarned }
}
