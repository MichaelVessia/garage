import {
  initial,
  suggestRecipe,
  medalSparkMultiplier,
  toolUnlock,
  amplifier,
  canAfford,
  efficiency,
  productionSpeed,
  sideContract,
  surgeInterval,
  upgradeLimit,
  upgradeUnlock,
  expansionUnlock,
  expansionCost,
  beltRate,
  craftPeriod,
  extractorPeriod,
  milestoneFor,
  missionRate,
  upgradeCost,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'

import { ascendPanel } from './ascend.ts'
import type { AscendActions } from './ascend.ts'
import { oreColor } from './machines.ts'
import { medalGrid } from './medals.ts'
import { tools } from './tools.ts'
import type { Tool } from './tools.ts'
import { vaultRows } from './vault.ts'

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
function formatTime(ticks: number) {
  const seconds = Math.floor(ticks / 60)
  return Str.padStart(2, '0')(String(Math.floor(seconds / 60))) + ':' + Str.padStart(2, '0')(String(seconds % 60))
}
function recipeButton(read: () => string) {
  const wrap = document.createElement('span')
  const button = document.createElement('button')
  const answer = tag('', 'recipe-answer')
  button.className = 'recipe-button'
  button.textContent = '?'
  button.setAttribute('aria-label', 'Recipe hint')
  button.setAttribute('aria-expanded', 'false')
  answer.hidden = true
  button.onclick = () => {
    answer.hidden = answer.hidden === false
    button.setAttribute('aria-expanded', String(answer.hidden === false))
    if (answer.hidden === false) {
      answer.textContent = read()
    }
  }
  wrap.append(button, answer)
  return wrap
}
function requirementRow(
  { value, quota, minRatePerMin }: ReturnType<typeof milestoneFor>['requirements'][number],
  read: () => string
) {
  const row = document.createElement('div')
  row.className = 'requirement'
  row.style.setProperty('--ore', '#' + Str.padStart(6, '0')(oreColor(value).toString(16)))
  const target = tag('', 'target')
  target.append(tag('Target ', 'target-label'), String(value))
  const count = tag('', 'quota')
  const rate = tag('', 'rate')
  const meter = document.createElement('progress')
  meter.max = quota
  meter.setAttribute('aria-label', 'Quota for target ' + value)
  target.append(recipeButton(read))
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
function updateStock(p: Progress) {
  const rows = vaultRows(p)
  const peak = Math.max(1, ...Arr.map(rows, (row) => row.rate))
  element('stock').replaceChildren(
    ...Arr.map(rows, ({ value, stock, rate, tags }) => {
      const row = document.createElement('div')
      row.className = 'stock-row'
      const token = tag(String(value), 'stock-token')
      token.style.setProperty('--ore', '#' + Str.padStart(6, '0')(oreColor(value).toString(16)))
      const meter = document.createElement('progress')
      meter.max = peak
      meter.value = rate
      meter.setAttribute('aria-label', 'Delivery activity for ' + value)
      row.append(token, tag(stock + ' stock', 'stock-count'), tag('+' + rate + '/min', 'stock-rate'), meter)
      if (tags.length > 0) {
        row.append(tag(Arr.join(tags, ' · '), 'stock-tags'))
      }
      return row
    })
  )
}
export function hud({
  choose,
  buy,
  expand,
  veins,
  ...actions
}: AscendActions & {
  veins: () => ReadonlyArray<number>
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
    button.dataset.tool = t.id
    button.title = t.name
    name.textContent = t.id === 'buffer' ? 'Silo' : t.name
    button.append(glyph, hotkey, name)
    button.onclick = () => choose(t.id)
    element('dock').append(button)
    return { t, button }
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
  const ascension = ascendPanel({ element, ...actions })
  const panels = ['upgrade', 'vault', 'ascend'] as const
  let panel: (typeof panels)[number] = 'upgrade'
  let latest = initial
  function recipe(target: number) {
    const ops = Arr.filter(['add', 'mul', 'sub', 'div'] as const, (op) => toolUnlock[op] <= latest.milestoneIndex)
    return suggestRecipe(target, veins(), ops)[0] ?? 'No short recipe on this floor.'
  }
  const updateMedals = medalGrid({ grid: element('medal-grid'), bonus: element('medal-bonus') })
  let medalKey = ''
  let contractKey = ''
  function selectPanel(selected: typeof panel) {
    panel = selected
    ascension.cancel()
    for (const name of panels) {
      element(name + '-panel').hidden = name !== selected
      element(name === 'upgrade' ? 'show-upgrades' : 'show-' + name).setAttribute(
        'aria-pressed',
        String(name === selected)
      )
    }
    element('mastery').hidden = selected === 'upgrade'
    element('run-summary').hidden = selected === 'upgrade'
    if (selected === 'vault') {
      updateStock(latest)
    }
  }
  element('show-upgrades').onclick = () => selectPanel('upgrade')
  element('show-vault').onclick = () => selectPanel('vault')
  element('show-ascend').onclick = () => selectPanel('ascend')
  const mobile = window.matchMedia('(max-width: 768px)')
  const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
  const workshop = element('workshop')
  const sheet = document.querySelector<HTMLDialogElement>('dialog#workshop-sheet')
  if (sheet === null) {
    throw new Error('Expected a Workshop dialog')
  }
  const moreActions = element('more-actions')
  const layoutWorkshop = () => {
    if (mobile.matches) {
      sheet.append(workshop)
      moreActions.setAttribute('popover', 'auto')
      workshop.hidden = false
    } else {
      sheet.close()
      sheet.after(workshop)
      moreActions.removeAttribute('popover')
      workshop.hidden = latest.milestoneIndex === 0 && latest.meta.ascensions === 0
    }
  }
  layoutWorkshop()
  mobile.addEventListener('change', layoutWorkshop)
  element('open-workshop').onclick = () => {
    workshop.setAttribute('open', '')
    if (latest.milestoneIndex === 0 && panel === 'upgrade') {
      selectPanel('vault')
    }
    sheet.show()
    element('close-workshop').focus()
  }
  element('close-workshop').onclick = () => sheet.close()
  sheet.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      sheet.close()
    }
  }
  const contractMeter = element('contract-meter')
  let previousSparks = 0
  let previousMutator = initial.meta.mutator
  let previousTier = -1
  let previousMission = -1
  let rows: ReadonlyArray<(p: Progress) => void> = []
  return (p: Progress, tool: Tool) => {
    latest = p
    element('run-time').textContent =
      'Run ' +
      formatTime(p.runTicks) +
      (Option.isSome(p.meta.bestRunTicks) ? ' · M8 best ' + formatTime(p.meta.bestRunTicks.value) : '')
    const key = Arr.join(p.meta.medals, ',') + '.'
    if (key !== medalKey) {
      medalKey = key
      updateMedals(p.meta.medals)
    }
    if (previousMission !== p.milestoneIndex || previousMutator !== p.meta.mutator || previousTier !== p.boardTier) {
      previousTier = p.boardTier
      previousMission = p.milestoneIndex
      previousMutator = p.meta.mutator
      const m = milestoneFor(p)
      element('dock').classList.toggle('starter', p.milestoneIndex === 0)
      element('roadmap-list').replaceChildren(
        ...Arr.makeBy(10, (milestoneIndex) => {
          const mission = milestoneFor({ ...p, milestoneIndex })
          const row = document.createElement('li')
          if (milestoneIndex === p.milestoneIndex) {
            row.setAttribute('aria-current', 'step')
          }
          const label = (milestoneIndex < p.milestoneIndex ? '✓ ' : '') + 'M' + (milestoneIndex + 1)
          const targets = Arr.map(
            mission.requirements,
            (r) => r.quota + ' × ' + r.value + (r.minRatePerMin === undefined ? '' : ' (' + r.minRatePerMin + '/min)')
          )
          row.append(tag(label, 'stage'), tag(Arr.join(targets, ' + '), 'targets'), tag(mission.reward, 'unlock'))
          return row
        })
      )
      element('requirements').replaceChildren()
      rows = Arr.map(m.requirements, (r) => requirementRow(r, () => recipe(r.value)))
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
    element('sparks').textContent = mobile.matches ? compactNumber.format(p.sparks) : p.sparks.toLocaleString('en-US')
    for (const { t, button } of dock) {
      button.hidden = p.milestoneIndex < t.unlock
      button.setAttribute('aria-pressed', String(t.id === tool))
    }
    const showAscend = p.milestoneIndex >= 7 || p.meta.ascensions > 0
    workshop.hidden = !mobile.matches && p.milestoneIndex === 0 && !showAscend
    element('show-ascend').hidden = !showAscend
    if (!showAscend && panel === 'ascend') {
      selectPanel('upgrade')
    }
    ascension.update(p)
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
      const factor = productionSpeed(p)
      stat.textContent = u.rate(level, factor) + (maxed ? '' : ' → ' + u.rate(level + 1, factor))
      const cost = upgradeCost(level)
      button.disabled = maxed || !canAfford(p, cost)
      button.replaceChildren(maxed ? 'Maximum' : 'Buy ', ...(maxed ? [] : [price(cost, p)]))
    }
    const affordable =
      (element('expand-card').hidden === false && !expandButton.disabled) ||
      Arr.some(cards, ({ card, button }) => card.hidden === false && !button.disabled) ||
      (showAscend && element('core-tech').querySelector('button:enabled') !== null)
    workshop.classList.toggle('affordable', affordable)
    element('open-workshop').classList.toggle('affordable', affordable)
    element('open-workshop').setAttribute('aria-label', affordable ? 'Workshop, purchase available' : 'Workshop')
    element('vault-income').textContent =
      'Income efficiency · ' +
      Math.round(
        100 * efficiency(p.milestoneIndex) * (1 + 0.35 * p.meta.metaUpgrades.masterySynergy) * medalSparkMultiplier(p)
      ) +
      '%'
    if (panel === 'vault') {
      updateStock(p)
    }
    element('contract-card').hidden = p.milestoneIndex < 3
    if (p.milestoneIndex >= 3) {
      const c = sideContract(p.meta.seed, p.contractIndex)
      const id = p.meta.seed + '/' + p.contractIndex + '/' + p.boardTier
      if (id !== contractKey) {
        element('contract-hint').replaceChildren(recipeButton(() => recipe(c.value)))
        contractKey = id
      }
      element('contract').textContent = 'Deliver ' + c.value + ' · ' + p.contractDelivered + ' / ' + c.quota
      contractMeter.setAttribute('max', String(c.quota))
      contractMeter.setAttribute('value', String(p.contractDelivered))
      const jackpot = 1 + 0.4 * p.meta.metaUpgrades.contractMastery
      element('contract-reward').replaceChildren(
        'Reward ',
        price({
          sparks: Math.round(Math.round(c.sparks * jackpot) * medalSparkMultiplier(p)),
          stock: { [c.value]: Math.round(c.stock * jackpot) },
        })
      )
    }
  }
}
