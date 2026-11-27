import type { initial } from '@garage/beltworks-domain'
import {
  amplifier,
  canAfford,
  efficiency,
  sideContract,
  surgeInterval,
  upgradeLimit,
  upgradeUnlock,
  expansionUnlock,
  expansionCost,
  beltRate,
  craftPeriod,
  extractorPeriod,
  milestone,
  missionRate,
  upgradeCost,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'

import { oreColor } from './machines.ts'
import { tools } from './tools.ts'
import type { Tool } from './tools.ts'

export function element(id: string) {
  const el = document.getElementById(id)
  if (el === null) {
    throw new Error('Missing interface element ' + id)
  }
  return el
}
const upgrades = [
  {
    id: 'beltSpeed',
    title: 'Belt speed',
    rate: (lv: number, factor: number) => ((beltRate(lv) * factor * 60) / 1000).toFixed(1) + ' cells/s',
  },
  {
    id: 'extractorSpeed',
    title: 'Extractor speed',
    rate: (lv: number, factor: number) => ((factor * 60) / extractorPeriod(lv)).toFixed(1) + ' items/s',
  },
  {
    id: 'combinerSpeed',
    title: 'Combiner speed',
    rate: (lv: number, factor: number) => ((factor * 60) / craftPeriod(lv)).toFixed(1) + ' crafts/s',
  },
  { id: 'hubValue', title: 'Hub amplifier', rate: (lv: number) => amplifier(lv) + '× income' },
  {
    id: 'surge',
    title: 'Extractor surge',
    rate: (lv: number) => (Number.isFinite(surgeInterval(lv)) ? 'Bonus every ' + surgeInterval(lv) + ' items' : 'Off'),
  },
] as const

type Progress = typeof initial
type Cost = ReturnType<typeof upgradeCost>
function tag(text: string, className: string) {
  const node = document.createElement('span')
  node.textContent = text
  node.className = className
  return node
}
function price(cost: Cost, p?: Progress) {
  const parts = document.createDocumentFragment()
  function part(label: string, enough: boolean, ore = '#efc069') {
    const badge = tag(label, 'price ' + (p === undefined ? 'reward' : enough ? 'affordable' : 'short'))
    badge.style.setProperty('--ore', ore)
    parts.append(badge)
  }
  part(cost.sparks + ' Sparks', (p?.sparks ?? 0) >= cost.sparks)
  for (const [value, count] of Rec.toEntries(cost.stock)) {
    part(
      count + ' × ore ' + value,
      (p?.vault[value] ?? 0) >= count,
      '#' + Str.padStart(6, '0')(oreColor(Number(value)).toString(16))
    )
  }
  return parts
}
function requirementRow({ value, quota, minRatePerMin }: ReturnType<typeof milestone>['requirements'][number]) {
  const row = document.createElement('div')
  row.className = 'requirement'
  row.style.setProperty('--ore', '#' + Str.padStart(6, '0')(oreColor(value).toString(16)))
  const target = tag('Target ' + value, 'target')
  const count = tag('', 'quota')
  const rate = tag('', 'rate')
  const meter = document.createElement('progress')
  meter.max = quota
  meter.setAttribute('aria-label', 'Quota for target ' + value)
  row.append(target, count, rate, meter)
  element('requirements').append(row)
  return (p: Progress) => {
    const delivered = p.delivered[value] ?? 0
    const currentRate = missionRate({ p, value })
    count.textContent = (delivered >= quota ? '✓ ' : '') + delivered + ' / ' + quota
    meter.value = Math.min(quota, delivered)
    rate.textContent =
      (minRatePerMin !== undefined && currentRate >= minRatePerMin ? '✓ ' : '') +
      currentRate +
      (minRatePerMin === undefined ? '' : ' / ' + minRatePerMin) +
      ' per min'
    rate.classList.toggle('met', minRatePerMin !== undefined && currentRate >= minRatePerMin)
  }
}
export function hud({
  choose,
  buy,
  expand,
}: {
  expand: () => void
  choose: (t: Tool) => void
  buy: (u: keyof typeof initial.upgrades) => void
}) {
  const dock = Arr.map(tools, (t) => {
    const button = document.createElement('button')
    const name = document.createElement('span'),
      glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      hotkey = document.createElement('small')
    glyph.setAttribute('viewBox', '0 0 22 22')
    glyph.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', t.path)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.6')
    path.setAttribute('stroke-linejoin', 'round')
    glyph.append(path)
    hotkey.textContent = t.key
    button.append(glyph, hotkey, name)
    button.onclick = () => choose(t.id)
    element('dock').append(button)
    return { t, button, name }
  })
  const cards = Arr.map(upgrades, (u) => {
    const card = document.createElement('section'),
      title = document.createElement('strong'),
      stat = document.createElement('span'),
      button = document.createElement('button')
    title.textContent = u.title
    card.className = 'upgrade'
    button.onclick = () => buy(u.id)
    const levelBadge = document.createElement('span')
    levelBadge.className = 'level'
    const bar = document.createElement('div')
    bar.className = 'pips'
    for (let i = 0; i < upgradeLimit(u.id); i++) {
      bar.append(document.createElement('i'))
    }
    card.append(title, levelBadge, bar, stat, button)
    element('upgrades').append(card)
    return { u, card, stat, button, levelBadge, bar }
  })
  const expandButton = document.createElement('button')
  expandButton.onclick = expand
  element('expand-card').append(expandButton)
  function selectVault(selected: boolean) {
    element('upgrade-panel').hidden = selected
    element('vault-panel').hidden = !selected
    element('show-upgrades').setAttribute('aria-pressed', String(!selected))
    element('show-vault').setAttribute('aria-pressed', String(selected))
  }
  element('show-upgrades').onclick = () => selectVault(false)
  element('show-vault').onclick = () => selectVault(true)
  const contractMeter = element('contract-meter')
  let previousSparks = 0
  let previousMission = -1
  let rows: ReadonlyArray<(p: Progress) => void> = []
  return (p: Progress, tool: Tool) => {
    if (previousMission !== p.milestoneIndex) {
      previousMission = p.milestoneIndex
      const m = milestone(p.milestoneIndex)
      element('requirements').replaceChildren()
      rows = Arr.map(m.requirements, requirementRow)
      element('milestone').textContent = 'Milestone ' + (p.milestoneIndex + 1)
      element('reward').textContent = m.reward.length > 0 ? 'Unlocks ' + m.reward : 'Deliver to earn Sparks'
    }
    for (const update of rows) {
      update(p)
    }
    if (p.sparks > previousSparks) {
      element('sparks').parentElement?.animate(
        [{ transform: 'scale(1.05)', color: '#fff0b9' }, { transform: 'scale(1)' }],
        220
      )
    }
    previousSparks = p.sparks
    element('sparks').textContent = p.sparks.toLocaleString('en-US')
    for (const { t, button, name } of dock) {
      button.hidden = p.milestoneIndex < t.unlock
      button.setAttribute('aria-pressed', String(t.id === tool))
      name.textContent = t.name
    }
    element('workshop').hidden = p.milestoneIndex === 0
    const full = p.boardTier === 3
    element('expand-card').hidden = !full && p.milestoneIndex < expansionUnlock(p.boardTier)
    element('expansion').textContent =
      ['Ring 1 · 18×14', 'Ring 2 · 26×20', 'Full floor · 36×26', 'Full floor unlocked · 36×26'][p.boardTier] ?? ''
    const expansion = expansionCost(p.boardTier)
    expandButton.disabled = full || !canAfford(p, expansion)
    expandButton.replaceChildren(full ? 'Maximum' : 'Buy ', ...(full ? [] : [price(expansion, p)]))
    for (const { u, card, stat, button, levelBadge, bar } of cards) {
      card.hidden = p.milestoneIndex < upgradeUnlock(u.id)
      const level = p.upgrades[u.id]
      const limit = upgradeLimit(u.id)
      const maxed = level >= limit
      levelBadge.textContent = 'Lv ' + level + '/' + limit
      for (let i = 0; i < bar.children.length; i++) {
        bar.children.item(i)?.classList.toggle('lit', i < level)
      }
      const factor = efficiency(p.milestoneIndex)
      stat.textContent = u.rate(level, factor) + (maxed ? '' : ' → ' + u.rate(level + 1, factor))
      const cost = upgradeCost(level)
      button.disabled = maxed || !canAfford(p, cost)
      button.replaceChildren(maxed ? 'Maximum' : 'Buy ', ...(maxed ? [] : [price(cost, p)]))
    }
    element('vault-income').textContent = 'Income efficiency · ' + Math.round(100 * efficiency(p.milestoneIndex)) + '%'
    const stock = Arr.filter(Rec.toEntries(p.vault), ([value, count]) => count > 0 || (p.rateByValue[value] ?? 0) > 0)
    element('stock').replaceChildren(
      ...(stock.length > 0
        ? Arr.map(stock, ([value, count]) =>
            tag(count + ' × ore ' + value + ' · +' + (p.rateByValue[value] ?? 0) + '/min', 'price')
          )
        : ['Vault empty'])
    )
    element('contract-card').hidden = p.milestoneIndex < 3
    if (p.milestoneIndex >= 3) {
      const c = sideContract(p.seed, p.contractIndex)
      element('contract').textContent = 'Deliver ' + c.value + ' · ' + p.contractDelivered + ' / ' + c.quota
      contractMeter.setAttribute('max', String(c.quota))
      contractMeter.setAttribute('value', String(p.contractDelivered))
      element('contract-reward').replaceChildren('Reward ', price({ sparks: c.sparks, stock: { [c.value]: c.stock } }))
    }
  }
}
