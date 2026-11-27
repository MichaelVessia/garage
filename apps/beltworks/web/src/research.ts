import {
  amplifier,
  productionSpeed,
  surgeInterval,
  upgradeLimit,
  upgradeUnlock,
  expansionUnlock,
  expansionCost,
  beltRate,
  craftPeriod,
  extractorPeriod,
  canAfford,
  initial,
  upgradeCost,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
const upgrades = {
  beltSpeed: {
    title: 'Belt speed',
    rate: (lv: number, factor: number) => ((beltRate(lv) * factor * 60) / 1000).toFixed(1) + ' cells/s',
  },
  extractorSpeed: {
    title: 'Extractor speed',
    rate: (lv: number, factor: number) => ((factor * 60) / extractorPeriod(lv)).toFixed(1) + ' items/s',
  },
  combinerSpeed: {
    title: 'Combiner speed',
    rate: (lv: number, factor: number) => ((factor * 60) / craftPeriod(lv)).toFixed(1) + ' crafts/s',
  },
  hubValue: { title: 'Hub amplifier', rate: (lv: number) => amplifier(lv) + '× income' },
  surge: {
    title: 'Extractor surge',
    rate: (lv: number) => (Number.isFinite(surgeInterval(lv)) ? 'Bonus every ' + surgeInterval(lv) + ' items' : 'Off'),
  },
} as const

type Progress = typeof initial
type Upgrade = keyof Progress['upgrades']
type NodeId = Upgrade | 'expand'
type Cost = ReturnType<typeof upgradeCost>
type State = {
  title: string
  level: string
  effect: string
  fraction: number
  lock: number
  ready: boolean
  action: string
  cost: Option.Option<Cost>
}
const rings = ['18×14 · unlocks 3 & 4 veins', '26×20 · unlocks 5, 6 & 7 veins', '36×26 · unlocks the full foundry']

function nodeState(id: NodeId, p: Progress): State {
  if (id === 'expand') {
    const tier = p.boardTier
    const cost = expansionCost(tier)
    const lock = expansionUnlock(tier)
    return {
      title: tier < 3 ? 'Expand · Ring ' + (tier + 1) : 'Full foundry',
      level: 'R' + Math.min(3, tier + 1) + '/3',
      effect: rings[tier] ?? 'All rings unlocked',
      fraction: tier / 3,
      lock: tier < 3 ? lock : 0,
      ready: tier < 3 && p.milestoneIndex >= lock && canAfford(p, cost),
      cost: tier < 3 ? Option.some(cost) : Option.none(),
      action: 'Expand',
    }
  }
  const upgrade = upgrades[id]
  const lv = p.upgrades[id]
  const limit = upgradeLimit(id)
  const cost = upgradeCost(lv)
  const lock = upgradeUnlock(id)
  const rate = (level: number) => upgrade.rate(level, productionSpeed(p))
  return {
    title: upgrade.title + ' · Lv ' + lv + (lv < limit ? ' → ' + (lv + 1) : ''),
    level: 'L' + lv,
    effect: rate(lv) + (lv < limit ? ' → ' + rate(lv + 1) : ''),
    fraction: lv / limit,
    lock,
    ready: lv < limit && p.milestoneIndex >= lock && canAfford(p, cost),
    cost: lv < limit ? Option.some(cost) : Option.none(),
    action: 'Upgrade',
  }
}
export function upgradeGrid({
  element,
  price,
  buy,
  expand,
}: {
  element: (id: string) => HTMLElement
  price: (cost: Cost, p: Progress) => DocumentFragment
  buy: (id: Upgrade) => void
  expand: () => void
}) {
  let selected: NodeId = 'beltSpeed'
  let latest = initial
  let lastCost = ''
  const action = element('research-buy')
  action.onclick = () => {
    if (selected === 'expand') {
      expand()
    } else {
      buy(selected)
    }
  }
  const nodes = Arr.map(
    ['beltSpeed', 'extractorSpeed', 'combinerSpeed', 'hubValue', 'surge', 'expand'] as const,
    (id) => {
      const button = element('node-' + id)
      const level = button.querySelector('small')
      if (level === null) {
        throw new Error('Missing research level')
      }
      button.onclick = () => {
        selected = id
        update(latest)
      }
      return { id, button, level }
    }
  )
  function update(p: Progress) {
    latest = p
    let affordable = false
    for (const { id, button, level } of nodes) {
      const state = nodeState(id, p)
      const locked = state.lock > p.milestoneIndex
      const badge = locked ? 'M' + state.lock : state.level
      if (level.textContent !== badge) {
        level.textContent = badge
      }
      const fill = Math.round(100 * state.fraction) + '%'
      if (button.style.getPropertyValue('--fill') !== fill) {
        button.style.setProperty('--fill', fill)
      }
      button.classList.toggle('available', state.ready)
      button.classList.toggle('locked', locked)
      if (button.getAttribute('aria-pressed') !== String(id === selected)) {
        button.setAttribute('aria-pressed', String(id === selected))
      }
      affordable ||= state.ready
      if (id !== selected) {
        continue
      }
      const effect = (locked ? 'Complete M' + state.lock + ' · ' : '') + state.effect
      const label = state.action
      for (const [el, text] of [
        [element('research-name'), state.title],
        [element('research-effect'), effect],
        [action, label],
      ] as const) {
        if (el.textContent !== text) {
          el.textContent = text
        }
      }
      action.toggleAttribute('disabled', state.ready === false)
      const cost = Option.getOrUndefined(state.cost)
      const key =
        cost === undefined
          ? ''
          : Arr.join(
              [
                String(cost.sparks),
                String(p.sparks >= cost.sparks),
                ...Arr.map(
                  Rec.toEntries(cost.stock),
                  ([value, n]) => value + '/' + n + '/' + ((p.vault[value] ?? 0) >= n)
                ),
              ],
              ':'
            )
      if (lastCost !== key) {
        lastCost = key
        element('research-cost').replaceChildren(...(cost === undefined ? [] : [price(cost, p)]))
      }
    }
    return affordable
  }
  return {
    update,
    selectDefault(p: Progress) {
      if (nodeState(selected, p).ready) {
        update(p)
        return
      }
      for (const { id } of nodes) {
        if (nodeState(id, p).ready) {
          selected = id
          break
        }
      }
      update(p)
    },
  }
}
