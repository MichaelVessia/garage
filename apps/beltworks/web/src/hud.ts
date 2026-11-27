import {
  initial,
  suggestRecipe,
  medalSparkMultiplier,
  toolUnlock,
  efficiency,
  sideContract,
  milestoneFor,
  missionRate,
} from '@garage/beltworks-domain'
import type { upgradeCost } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'

import { ascendPanel } from './ascend.ts'
import type { AscendActions } from './ascend.ts'
import { oreColor } from './machines.ts'
import { medalGrid } from './medals.ts'
import { researchTree } from './research.ts'
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
type Progress = typeof initial
type Cost = ReturnType<typeof upgradeCost>
function tag(text: string, className: string) {
  const node = document.createElement('span')
  node.textContent = text
  node.className = className
  return node
}
function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) {
    node.textContent = text
  }
}
function price(cost: Cost, p?: Progress) {
  const parts = document.createDocumentFragment()
  function part(label: string, enough: boolean, ore = '#efc069') {
    const badge = tag(label, 'price ' + (p === undefined ? 'reward' : enough ? 'affordable' : 'short'))
    badge.style.setProperty('--ore', ore)
    parts.append(badge)
  }
  part(cost.sparks + ' ✦', (p?.sparks ?? 0) >= cost.sparks)
  for (const [value, count] of Rec.toEntries(cost.stock)) {
    part(
      count + ' × [' + value + ']',
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
    setText(count, (delivered >= quota ? '✓ ' : '') + delivered + ' / ' + quota)
    if (meter.value !== Math.min(quota, delivered)) {
      meter.value = Math.min(quota, delivered)
    }
    setText(
      rate,
      (minRatePerMin !== undefined && currentRate >= minRatePerMin ? '✓ ' : '') +
        currentRate +
        (minRatePerMin === undefined ? '' : ' / ' + minRatePerMin) +
        ' per min'
    )
    rate.classList.toggle('met', minRatePerMin !== undefined && currentRate >= minRatePerMin)
  }
}
function updateStock(p: Progress) {
  const rows = vaultRows(p)
  element('stock').replaceChildren(
    ...Arr.map(rows, ({ value, stock, rate, tags }) => {
      const row = document.createElement('div')
      row.className = 'stock-row'
      const token = tag(String(value), 'stock-token')
      token.style.setProperty('--ore', '#' + Str.padStart(6, '0')(oreColor(value).toString(16)))
      row.append(token, tag(String(stock), 'stock-count'), tag('+' + rate + '/min', 'stock-rate'))
      if (tags.length > 0) {
        const demand = tag('•', 'stock-demand')
        demand.title = Arr.join(tags, ' · ')
        row.append(demand)
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
    button.title = 'title' in t ? t.title : t.name
    name.textContent = t.id === 'buffer' ? 'Silo' : t.name
    button.append(glyph, hotkey, name)
    button.onclick = () => choose(t.id)
    element('dock').append(button)
    return { t, button }
  })
  const tree = researchTree({ element, price, buy, expand, openAscend: () => selectPanel('ascend') })
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
  let previousRewardKey = ''
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
    if (selected === 'upgrade') {
      tree.selectDefault(latest)
    }
    if (selected === 'vault') {
      updateStock(latest)
    }
  }
  element('show-upgrades').onclick = () => selectPanel('upgrade')
  element('show-vault').onclick = () => selectPanel('vault')
  element('show-ascend').onclick = () => selectPanel('ascend')
  const mobile = window.matchMedia('(max-width: 768px)')
  const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
  const trigger = element('open-workshop')
  const sheet = document.querySelector<HTMLDialogElement>('dialog#workshop-sheet')
  if (sheet === null) {
    throw new Error('Expected a Research dialog')
  }
  const openResearch = () => {
    if (trigger.hidden === true) {
      return
    }
    selectPanel('upgrade')
    sheet.showModal()
    element('close-workshop').focus()
  }
  window.addEventListener('keydown', (event) => {
    if (
      Str.toLowerCase(event.key) !== 'u' ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.target === document.querySelector('input:focus') ||
      document.querySelector('dialog[open]') !== null
    ) {
      return
    }
    trigger.click()
  })
  trigger.onclick = openResearch
  element('quick-upgrade').onclick = () => {
    element('milestone-banner').hidden = true
    openResearch()
  }
  element('close-workshop').onclick = () => sheet.close()
  sheet.onclose = () => ascension.cancel()
  sheet.onclick = (event) => {
    if (event.target === sheet) {
      sheet.close()
    }
  }
  sheet.onkeydown = (event) => {
    if (event.key === 'Escape' || Str.toLowerCase(event.key) === 'u') {
      event.stopPropagation()
      event.preventDefault()
      if (event.repeat === false) {
        sheet.close()
      }
    }
  }
  const contractMeter = element('contract-meter')
  let previousSparks = 0
  let previousMutator = initial.meta.mutator
  let previousTier = -1
  let previousMission = -1
  let rows: ReadonlyArray<(p: Progress) => void> = []
  return (p: Progress, tool: Tool) => {
    const previous = latest
    const first = previousMission < 0
    latest = p
    setText(
      element('run-time'),
      'Run ' +
        formatTime(p.runTicks) +
        (Option.isSome(p.meta.bestRunTicks) ? ' · M8 best ' + formatTime(p.meta.bestRunTicks.value) : '')
    )
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
    trigger.hidden = p.milestoneIndex === 0 && p.meta.ascensions === 0
    if (trigger.hidden && sheet.open) {
      sheet.close()
    }
    if (first === false && previous.milestoneIndex === 0 && p.milestoneIndex === 1 && p.meta.ascensions === 0) {
      trigger.classList.add('guided')
      window.setTimeout(() => trigger.classList.remove('guided'), 5000)
    }
    element('show-ascend').hidden = !showAscend
    if (!showAscend && panel === 'ascend') {
      selectPanel('upgrade')
    }
    if (
      first ||
      previous.meta !== p.meta ||
      previous.milestoneIndex !== p.milestoneIndex ||
      previous.contractIndex !== p.contractIndex
    ) {
      ascension.update(p)
    }
    const affordable = tree.update(p)
    trigger.classList.toggle('affordable', affordable)
    trigger.setAttribute('aria-label', affordable ? 'Research, purchase available' : 'Research')
    element('vault-income').textContent =
      'Income efficiency · ' +
      Math.round(
        100 * efficiency(p.milestoneIndex) * (1 + 0.35 * p.meta.metaUpgrades.masterySynergy) * medalSparkMultiplier(p)
      ) +
      '%'
    if (
      sheet.open &&
      panel === 'vault' &&
      (p.vault !== previous.vault ||
        p.rateByValue !== previous.rateByValue ||
        p.upgrades !== previous.upgrades ||
        p.boardTier !== previous.boardTier ||
        p.contractIndex !== previous.contractIndex ||
        p.milestoneIndex !== previous.milestoneIndex)
    ) {
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
      const rewardKey = id + '/' + p.meta.metaUpgrades.contractMastery + '/' + medalSparkMultiplier(p)
      if (rewardKey !== previousRewardKey) {
        const jackpot = 1 + 0.4 * p.meta.metaUpgrades.contractMastery
        element('contract-reward').replaceChildren(
          'Reward ',
          price({
            sparks: Math.round(Math.round(c.sparks * jackpot) * medalSparkMultiplier(p)),
            stock: { [c.value]: Math.round(c.stock * jackpot) },
          })
        )
        previousRewardKey = rewardKey
      }
    }
  }
}
