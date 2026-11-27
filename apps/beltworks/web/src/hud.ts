import type { initial } from '@garage/beltworks-domain'
import {
  expansionUnlock,
  expansionCost,
  beltRate,
  craftPeriod,
  extractorPeriod,
  milestone,
  upgradeCost,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
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
  { id: 'beltSpeed', title: 'Belt speed', rate: (lv: number) => ((beltRate(lv) * 60) / 1000).toFixed(1) + ' cells/s' },
  {
    id: 'extractorSpeed',
    title: 'Extractor speed',
    rate: (lv: number) => (60 / extractorPeriod(lv)).toFixed(1) + ' items/s',
  },
  {
    id: 'combinerSpeed',
    title: 'Combiner speed',
    rate: (lv: number) => (60 / craftPeriod(lv)).toFixed(1) + ' crafts/s',
  },
] as const
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
    for (let i = 0; i < 5; i++) {
      bar.append(document.createElement('i'))
    }
    card.append(title, levelBadge, bar, stat, button)
    element('upgrades').append(card)
    return { u, stat, button, levelBadge, bar }
  })
  const expandButton = document.createElement('button')
  expandButton.onclick = expand
  element('expand-card').append(expandButton)
  let previousSparks = 0
  return (p: typeof initial, tool: Tool) => {
    const m = milestone(p.milestoneIndex)
    element('target-value').textContent = String(m.targetValue)
    element('target').style.setProperty('--ore', '#' + Str.padStart(6, '0')(oreColor(m.targetValue).toString(16)))
    element('milestone').textContent = 'Milestone ' + (p.milestoneIndex + 1)
    element('reward').textContent = m.reward.length > 0 ? 'Unlocks ' + m.reward : 'Deliver to earn Sparks'
    element('count').textContent = p.deliveredInMilestone + ' / ' + m.quota + ' · ' + p.deliveryTicks.length + '/min'
    element('meter').setAttribute('aria-valuemax', String(m.quota))
    element('meter').setAttribute('aria-valuenow', String(p.deliveredInMilestone))
    element('meter').style.setProperty('--progress', String((100 * p.deliveredInMilestone) / m.quota) + '%')
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
    const cost = expansionCost(p.boardTier)
    element('expand-card').hidden = p.boardTier < 2 && p.milestoneIndex < expansionUnlock(p.boardTier)
    element('expansion').textContent =
      [
        'Expand to Ring 1 (18×14 · unlocks 3 & 4 veins)',
        'Expand to Full Floor (24×18 · unlocks 5, 6 & 7 clusters)',
        'Full floor unlocked (24×18)',
      ][p.boardTier] ?? ''
    expandButton.disabled = p.boardTier === 2 || p.sparks < cost
    expandButton.textContent = p.boardTier === 2 ? 'Maxed' : 'Buy · ' + cost + ' Sparks'
    for (const { u, stat, button, levelBadge, bar } of cards) {
      const level = p.upgrades[u.id],
        cost = upgradeCost(level)
      levelBadge.textContent = 'Lv ' + level + '/5'
      for (let i = 0; i < bar.children.length; i++) {
        bar.children.item(i)?.classList.toggle('lit', i < level)
      }
      stat.textContent =
        level >= 5 ? 'Maxed · ' + u.rate(level) : Str.split(u.rate(level), ' ')[0] + ' → ' + u.rate(level + 1)
      button.disabled = level >= 5 || p.sparks < cost
      button.textContent = level >= 5 ? 'Maximum' : 'Buy · ' + cost + ' Sparks'
    }
  }
}
