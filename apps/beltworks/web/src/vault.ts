import {
  landmarks,
  expansionCost,
  expansionUnlock,
  milestoneFor,
  sideContract,
  upgradeCost,
  upgradeLimit,
  upgradeUnlock,
} from '@garage/beltworks-domain'
import type { initial } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'

export function vaultRows(p: typeof initial) {
  const requirements = milestoneFor(p).requirements
  const contract = p.milestoneIndex >= 3 ? sideContract(p.meta.seed, p.contractIndex).value : undefined
  const needed: Array<string> = []
  for (const [key, level] of Rec.toEntries(p.upgrades)) {
    if (p.milestoneIndex >= upgradeUnlock(key) && level < upgradeLimit(key)) {
      for (const value of Rec.keys(upgradeCost(level).stock)) {
        needed.push(value)
      }
    }
  }
  if (p.milestoneIndex >= expansionUnlock(p.boardTier)) {
    for (const value of Rec.keys(expansionCost(p.boardTier).stock)) {
      needed.push(value)
    }
  }
  const values = Arr.dedupe([
    ...landmarks,
    ...Arr.map(requirements, (r) => r.value),
    ...Arr.map(Rec.keys(p.vault), Number),
    ...(contract === undefined ? [] : [contract]),
  ])
  return Arr.map(values, (value) => {
    const tags = []
    if (Arr.some(requirements, (r) => r.value === value)) {
      tags.push('Milestone')
    }
    if (Arr.contains(needed, String(value))) {
      tags.push('Upgrade')
    }
    if (value === contract) {
      tags.push('Contract')
    }
    return { value, stock: p.vault[value] ?? 0, rate: p.rateByValue[value] ?? 0, tags }
  })
}
