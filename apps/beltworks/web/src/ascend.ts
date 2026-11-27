import { coresEarned, initial, metaUpgradeCost, metaUpgradeLimits } from '@garage/beltworks-domain'
import type { MetaUpgradeKey, Mutator } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'

const mutators = {
  standard: ['Standard', 'Standard production and Core payout.'],
  primeRush: ['Prime Rush', 'Prime targets. Earn 30% more Cores.'],
  highVelocity: ['High Velocity', '35% faster production. Rate targets rise 50%. Earn 30% more Cores.'],
} as const satisfies Record<Mutator, readonly [string, string]>

const technology = {
  bootstrap: ['Bootstrap', 'Start each run with one extra belt and extractor level and 50 Sparks per rank.'],
  masterySynergy: ['Mastery Synergy', 'Gain 35% more Sparks and passive Vault stock per rank.'],
  beaconResonance: [
    'Beacon Resonance',
    'Ranks raise the speed cap to 150%, extend range to 3 cells, then double fuel time.',
  ],
  veinRichness: ['Vein Richness', 'Add vein cells to the outer rings on each new board.'],
  contractMastery: ['Contract Mastery', 'Gain 40% more Sparks and stock from contracts per rank.'],
} as const satisfies Record<MetaUpgradeKey, readonly [string, string]>

export type AscendActions = {
  ascend: (mutator: Mutator) => void
  buyMeta: (key: MetaUpgradeKey) => void
}

export function ascendPanel({ element, ...actions }: AscendActions & { element: (id: string) => HTMLElement }) {
  const ascend = element('ascend')
  let next: Mutator = 'standard'
  let timer = 0
  function cancel() {
    window.clearTimeout(timer)
    timer = 0
    ascend.textContent = 'Ascend'
  }
  ascend.onclick = () => {
    if (timer !== 0) {
      cancel()
      actions.ascend(next)
      return
    }
    ascend.textContent = 'Confirm Ascend · Reset this run'
    timer = window.setTimeout(cancel, 5000)
  }
  const pills = Arr.map(Rec.toEntries(mutators), ([key, [label]]) => {
    const button = document.createElement('button')
    button.textContent = label
    button.onclick = () => select(key)
    element('mutators').append(button)
    return { key, button }
  })
  function select(key: Mutator) {
    cancel()
    next = key
    for (const pill of pills) {
      pill.button.setAttribute('aria-pressed', String(pill.key === next))
    }
    element('mutator-effect').textContent = mutators[next][1]
  }
  select(next)
  let selected: MetaUpgradeKey = 'bootstrap'
  let latest = initial
  const purchase = element('core-buy')
  purchase.onclick = () => actions.buyMeta(selected)
  const nodes = Arr.map(Rec.toEntries(technology), ([key, [label]]) => {
    const button = document.createElement('button')
    const rank = document.createElement('small')
    button.append(label, rank)
    button.onclick = () => {
      selected = key
      updateTech(latest)
    }
    element('core-tech').append(button)
    return { key, button, rank }
  })
  function updateTech(p: typeof initial) {
    latest = p
    for (const { key, button, rank } of nodes) {
      const level = p.meta.metaUpgrades[key]
      const max = metaUpgradeLimits[key]
      const cost = metaUpgradeCost(key, level)
      rank.textContent = level + ' / ' + max
      button.setAttribute('aria-pressed', String(selected === key))
      if (selected !== key) {
        continue
      }
      element('core-name').textContent = technology[key][0]
      element('core-effect').textContent = technology[key][1]
      purchase.toggleAttribute('disabled', level >= max || p.meta.cores < cost)
      purchase.textContent = level >= max ? 'Maximum' : 'Buy · ' + cost + ' Cores'
    }
  }
  return {
    cancel,
    update(p: typeof initial) {
      const { cores, ascensions, mutator } = p.meta
      element('cores').textContent = String(cores)
      const eligible = p.milestoneIndex >= 8
      ascend.toggleAttribute('disabled', !eligible)
      element('payout').textContent = eligible
        ? 'Ascend now for +' + coresEarned(p.milestoneIndex, mutator) + ' Cores'
        : 'Complete Milestone 8 to ascend.'
      if (!eligible && timer !== 0) {
        cancel()
      }
      updateTech(p)
      element('run-summary').textContent =
        'Milestones cleared ' +
        p.milestoneIndex +
        ' · Contracts completed ' +
        p.contractIndex +
        ' · Ascensions ' +
        ascensions +
        ' · ' +
        mutators[mutator][0] +
        ' · Seed ' +
        p.meta.seed
    },
  }
}
