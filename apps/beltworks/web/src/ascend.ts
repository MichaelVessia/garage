import { coresEarned, metaUpgradeCost, metaUpgradeLimits } from '@garage/beltworks-domain'
import type { initial, MetaUpgradeKey, Mutator } from '@garage/beltworks-domain'
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
  const cards = Arr.map(Rec.toEntries(technology), ([key, [label, effect]]) => {
    const card = document.createElement('section')
    card.className = 'upgrade'
    const title = document.createElement('strong')
    title.textContent = label
    const rank = document.createElement('span')
    rank.className = 'level'
    const description = document.createElement('span')
    description.textContent = effect
    const button = document.createElement('button')
    button.onclick = () => actions.buyMeta(key)
    card.append(title, rank, description, button)
    element('core-tech').append(card)
    return { key, max: metaUpgradeLimits[key], rank, button }
  })
  return {
    cancel,
    update(p: typeof initial) {
      const { cores, ascensions, mutator, metaUpgrades } = p.meta
      element('cores').textContent = String(cores)
      const eligible = p.milestoneIndex >= 8
      ascend.toggleAttribute('disabled', !eligible)
      element('payout').textContent = eligible
        ? 'Ascend now for +' + coresEarned(p.milestoneIndex, mutator) + ' Cores'
        : 'Complete Milestone 8 to ascend.'
      if (!eligible && timer !== 0) {
        cancel()
      }
      for (const { key, max, rank, button } of cards) {
        const level = metaUpgrades[key]
        rank.textContent = 'Rank ' + level + '/' + max
        const cost = metaUpgradeCost(key, level)
        button.disabled = level >= max || cores < cost
        button.textContent = level >= max ? 'Maximum' : 'Buy · ' + cost + ' Cores'
      }
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
