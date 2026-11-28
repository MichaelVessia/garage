import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Records from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import { addressOf, patterns } from './block.ts'
import { createChat } from './chat.ts'
import { readBlock, sendCommand, syncPresence } from './client.ts'
import type { Pose, RequestReason } from './client.ts'
import { toolCatalog } from './economy.ts'
import { BlockView, Command } from './model.ts'
import type { LotView, Pattern, Tool } from './model.ts'
import { createWorld } from './world.ts'
import { createYardSound } from './yard-sound.ts'

import './style.css'

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id)
  if (!Schema.is(Schema.instanceOf(type))(node)) {
    throw new Error(`Missing element: ${id}`)
  }
  return node
}
const element = (id: string) => byId(id, HTMLElement)
const button = (id: string) => byId(id, HTMLButtonElement)
const dialog = byId('panel', HTMLDialogElement)
const claim = byId('claim', HTMLFormElement)
const name = byId('player-name', HTMLInputElement)
const automaticWatering = byId('automatic-watering', HTMLInputElement)
const targetField = byId('leaf-target', HTMLSelectElement)
function sendingLeaves() {
  return targetField.value !== '' && targetField.value !== 'sweep' && targetField.value !== 'forward'
}
const patternField = byId('pattern', HTMLSelectElement)
const patternOrder = ['straight', 'crosscut', 'diagonal', 'checker'] satisfies Array<Pattern>
type Player = NonNullable<BlockView['player']>

const toolsByPrice = Arr.sort(
  Records.keys(toolCatalog),
  Order.make<Tool>((a, b) => Order.Number(toolCatalog[a].price, toolCatalog[b].price))
)

function nextUpgrade(player: Player) {
  const equipped = player.equipped
  if (equipped !== null) {
    const next = Arr.findFirst(
      toolsByPrice,
      (item) => toolCatalog[item].requires === equipped && !player.tools.includes(item)
    )
    if (Option.isSome(next)) {
      return next.value
    }
  }
  return Option.getOrUndefined(
    Arr.findFirst(toolsByPrice, (item) => {
      const { requires } = toolCatalog[item]
      return !player.tools.includes(item) && (requires === null || player.tools.includes(requires))
    })
  )
}

function upgradeGoal(player: Player, item: Tool) {
  const { name: label, price } = toolCatalog[item]
  const remaining = price - player.coins
  return remaining > 0 ? `${label} · ${remaining} more coins` : `${label} ready in the shed`
}

const sameView = Schema.toEquivalence(BlockView)
const reasons = {
  'claim-taken': 'Another resident claimed this lawn.',
  'claim-required': 'Claim a lawn first.',
  'no-leaves': 'There are no leaves left in that pile or supply.',
  'invalid-destination': 'Choose another lawn.',
  'lawn-full': 'That lawn is full of leaves. Try another neighbor.',
  'no-change': 'This patch needs no more of that care.',
  'pattern-locked': 'Earn more XP to unlock that pattern.',
  'session-required': 'Allow session cookies to claim a lawn.',
  'invalid-command': 'Check the name or tool and try again.',
  'insufficient-coins': 'Use the reel mower or watering can to earn coins without supply costs.',
  'selection-mismatch': 'Your equipment changed. Check the tool shed.',
  'tool-locked': 'Buy the previous tool first.',
  'already-owned': 'You already own this tool.',
  'not-owner': 'Use your tool on your own lawn.',
  origin: 'Reload the street and try again.',
} satisfies Record<RequestReason, string>
type StreetSession = {
  world?: Awaited<ReturnType<typeof createWorld>>
  view?: BlockView
  pose?: Pose
  focused?: number
  returnSender?: number
  claiming?: number
}
const session: StreetSession = {}
const sound = createYardSound()
const soundToggle = byId('sound-enabled', HTMLInputElement)
document.addEventListener('pointerdown', () => sound.unlock(), { once: true })
document.addEventListener('keydown', () => sound.unlock(), { once: true })
soundToggle.onchange = () => {
  sound.setMuted(!soundToggle.checked)
}
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    sound.dispose()
  }
})
let peers: Awaited<ReturnType<typeof syncPresence>> = []
let presenceKnown = false
let posting = false
let putAwayAfterPost = false
let polling = false
let presencePending = false
let generation = 0
let noticeTimer = 0
let nextWork = 0
let receiptUntil = 0
let panel: 'claim' | 'inventory' | 'directory' | 'controls' = 'controls'

const chat = createChat({
  button: button('chat-button'),
  log: element('chat-log'),
  info: element('chat-info'),
  form: byId('chat-form', HTMLFormElement),
  input: byId('chat-text', HTMLInputElement),
  closeButton: button('chat-close'),
  stage: element('stage'),
  setActive(active) {
    element('leaf-launch').inert = active
    element('stage').inert = active || dialog.open
    session.world?.setWorkingEnabled(Boolean(session.view?.player) && !element('stage').inert)
  },
  canSend: () => Boolean(session.view?.player),
})

function message(text: string) {
  window.clearTimeout(noticeTimer)
  element('notice').textContent = text
  element('panel-notice').textContent = text
  noticeTimer = window.setTimeout(() => {
    element('notice').textContent = ''
    element('panel-notice').textContent = ''
  }, 4500)
}

function focusHint() {
  const lot = Option.getOrUndefined(Arr.findFirst(session.view?.lots ?? [], (entry) => entry.id === session.focused))
  element('focus-label').textContent =
    lot === undefined ? '' : `${addressOf(lot.id)} · ${lot.id === session.view?.player?.lot ? 'Your lawn' : lot.name}`
  button('move-in').hidden = !(lot?.bot === true && session.view?.player === null)
}

function updateOnline() {
  const count = peers.length + (session.view?.player?.lot !== undefined ? 1 : 0)
  element('online').textContent = presenceKnown ? `${count} online` : 'Neighbors'
}

const seasonTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
const inspectionTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })
const homeLot = (view: BlockView) =>
  Option.getOrUndefined(Arr.findFirst(view.lots, (lot) => lot.id === view.player?.lot))

function renderDeadline() {
  const warning = element('judging-warning')
  const until = (session.view?.nextJudgingAt ?? 0) - (performance.timeOrigin + performance.now())
  warning.hidden = until <= 0 || until > 60_000
  warning.textContent = warning.hidden ? '' : `Judging in ${Math.ceil(until / 1000)}s`
  if (dialog.open && panel === 'directory' && session.view !== undefined) {
    const { nextInspectionAt } = session.view.hoa
    if (nextInspectionAt === 0) {
      element('hoa-deadline').textContent = ''
      return
    }
    const now = performance.timeOrigin + performance.now()
    const seconds = Math.max(0, Math.ceil((nextInspectionAt - now) / 1000))
    const remaining =
      seconds === 0 ? 'Due now' : `${Math.floor(seconds / 60)}:${Str.padStart(2, '0')(String(seconds % 60))} left`
    element('hoa-deadline').textContent = `Next inspection at ${inspectionTime.format(nextInspectionAt)} · ${remaining}`
  }
}

function renderInspection(view: BlockView) {
  const winner = Option.getOrUndefined(Arr.findFirst(view.lots, (lot) => lot.id === view.yardWinner))
  const title = winner === undefined ? 'First award pending' : `${winner.name} · ${addressOf(winner.id)}`
  element('yard-award').textContent =
    `${title}. Karen awards the gold sign to the resident with the best curb appeal at ${inspectionTime.format(view.nextJudgingAt)}.`
  const home = homeLot(view)
  element('hoa-standard').textContent = view.hoa.standard
  const remarks =
    home?.hoa.compliant === false
      ? [
          '“I measured twice. The second reading did not improve your case.”',
          '“I have circled the problem in red. Again.”',
        ]
      : [
          '“Your lawn passes. I wrote that in pencil.”',
          '“Jorge and Miguel finish before breakfast. Just an observation.”',
        ]
  const round = Math.floor(view.hoa.nextInspectionAt / 360_000)
  const remark =
    home === undefined
      ? '“The board chose my lawn as the standard. I chaired the meeting.”'
      : remarks[round % remarks.length]
  const complaint =
    view.karenAnger >= 65
      ? '“I have the leaves, the photographs, and three copies of the complaint.”'
      : '“Those leaves did not blow uphill by themselves.”'
  element('hoa-comment').textContent = `Karen: ${view.karenAnger > 0 ? complaint : remark}`
  renderDeadline()
  element('hoa-remedy').textContent = view.hoa.remedy
  if (view.hoa.nextInspectionAt === 0) {
    element('hoa-current').textContent = ''
    element('hoa-result').textContent = ''
    return
  }
  if (home === undefined || view.player === null) {
    element('hoa-current').textContent = 'Claim a lawn to see its inspection status.'
    element('hoa-result').textContent = ''
    return
  }
  const { compliant, reading, lastResult } = home.hoa
  const { nextFine, lastFine } = view.player.hoa
  element('hoa-current').textContent = compliant
    ? `Your lawn now: ${reading}. Meets the standard.`
    : `Your lawn now: ${reading}. At risk of a fine of up to ${nextFine} coins.`
  const result = {
    pending: 'Pending. New owners get six minutes before their first inspection.',
    passed: 'Passed. No fine.',
    cited: `Cited. ${lastFine} ${lastFine === 1 ? 'coin' : 'coins'} deducted.`,
  } satisfies Record<typeof lastResult, string>
  element('hoa-result').textContent = `Last inspection: ${result[lastResult]}`
}

function renderLauncher() {
  const view = session.view
  const player = view?.player
  const tool = player?.equipped
  const launcher = element('leaf-launch')
  launcher.hidden = tool !== 'handheld-blower' && tool !== 'backpack-blower'
  if (
    view === undefined ||
    player === null ||
    player === undefined ||
    (tool !== 'handheld-blower' && tool !== 'backpack-blower')
  ) {
    session.world?.setBlowerTargeted(false)
    return
  }

  const neighbors = Arr.filter(view.lots, (lot) => lot.id !== player.lot)
  const ordered = Arr.sort(
    neighbors,
    Order.make<LotView>((a, b) => Order.Number(Number(a.bot), Number(b.bot)) || Order.Number(a.id, b.id))
  )
  const options = [
    { value: 'sweep', text: 'Clear lawn' },
    { value: 'forward', text: 'Push forward' },
    ...Arr.map(ordered, (lot) => ({ value: String(lot.id), text: `${lot.name} · ${addressOf(lot.id)}` })),
    { value: '0', text: 'Karen · HOA president' },
  ]
  if (
    targetField.options.length !== options.length ||
    Arr.some(options, (item, i) => {
      const option = targetField.options.item(i)
      return option?.value !== item.value || option.text !== item.text
    })
  ) {
    const previous = targetField.value
    targetField.replaceChildren(
      ...Arr.map(options, (item) => {
        const option = document.createElement('option')
        option.value = item.value
        option.textContent = item.text
        return option
      })
    )
    targetField.value = Arr.some(options, (option) => option.value === previous) ? previous : 'sweep'
  }

  const loose = Arr.reduce(homeLot(view)?.patches ?? [], 0, (sum, patch) => sum + patch.leaves)
  const fuel = toolCatalog[tool].cost
  session.world?.setBlowerTargeted(sendingLeaves())
  const supply = element('leaf-supply')
  const fuelText = `${fuel} ${fuel === 1 ? 'coin' : 'coins'}`
  supply.textContent =
    loose + player.baggedLeaves === 0
      ? 'No loose or bagged leaves. Rake in autumn to save a pile.'
      : player.coins < fuel
        ? `Earn ${fuelText} for blower fuel.`
        : `${loose} loose · ${player.baggedLeaves} bagged · ${fuelText} per blast`
}

function renderHud() {
  renderLauncher()
  const player = session.view?.player ?? null
  element('weather').textContent =
    session.view !== undefined
      ? `${Str.capitalize(session.view.season)} · ${session.view.weather} · ${session.view.lots.length} lawns`
      : 'Joining street…'
  const selected = player?.equipped ?? null
  const catalogItem = selected === null ? undefined : toolCatalog[selected]
  button('hand-slot').disabled = player === null
  button('hand-slot').title = catalogItem === undefined ? 'Choose a tool' : 'Unequip tool (X)'
  element('tool-label').textContent =
    player === null ? 'On foot' : catalogItem === undefined ? 'Equip a tool' : 'Unequip'
  element('tool-name').textContent = catalogItem?.name ?? (player === null ? 'Explore the street' : 'Empty hands')
  element('balance').hidden = player === null
  element('balance').textContent = player !== null ? `${player.coins} coins` : ''
  button('shed').hidden = player === null
  const touch = window.matchMedia('(any-pointer: coarse)').matches
  if (player === null) {
    element('hint').textContent = touch
      ? 'Drag left to walk. Drag right to look.'
      : 'WASD to walk · Q/E to turn · Find a lawn sign'
  } else if (selected === 'rake') {
    element('hint').textContent = touch ? 'Hold to rake leaves into a bag.' : 'Hold Space to rake leaves into a bag.'
  } else if (selected === 'handheld-blower' || selected === 'backpack-blower') {
    const work = touch ? 'Work' : 'Space or left mouse'
    const sender = Option.getOrUndefined(
      Arr.findFirst(session.view?.lots ?? [], (lot) => lot.id === session.returnSender)
    )
    element('hint').textContent =
      sender !== undefined
        ? `Press ${work} to return ${sender.name}’s leaf pile.`
        : sendingLeaves()
          ? touch
            ? 'Tap Send leaves for one blast.'
            : 'Press Space or click to send one blast.'
          : targetField.value === 'forward'
            ? `Hold ${work} to push leaves ahead.`
            : `Hold ${work} to sweep leaves into your bag.`
  } else if (catalogItem === undefined) {
    element('hint').textContent = 'Choose a tool in the tool shed.'
  } else {
    const supply =
      catalogItem.cost === 0 ? 'Free' : `${catalogItem.cost} ${catalogItem.cost === 1 ? 'coin' : 'coins'} per pass`
    const action = (touch ? 'Hold to work' : 'Hold Space') + ' · ' + supply
    const item = nextUpgrade(player)
    element('hint').textContent =
      item === undefined
        ? `${player.contract.description} · ${player.contract.progress}/${player.contract.target} · +${player.contract.bonus} coins`
        : `${action} · ${upgradeGoal(player, item)}`
  }
  const risk = session.view !== undefined && homeLot(session.view)?.hoa.compliant === false
  element('hoa-summary').textContent = risk ? 'HOA: at risk' : 'HOA notice'
  button('neighbors').toggleAttribute('data-risk', risk)
  updateOnline()
  focusHint()
}

function toolRow(item: Tool, player: Player) {
  const { name: labelText, description: details, price, requires } = toolCatalog[item]
  const row = document.createElement('div')
  row.className = 'tool-row'
  const title = document.createElement('strong')
  title.textContent = labelText
  const action = document.createElement('button')
  const owned = player.tools.includes(item)
  if (owned) {
    action.textContent =
      item === 'irrigation'
        ? player.automaticWatering
          ? 'On'
          : 'Off'
        : item === player.equipped
          ? 'Equipped'
          : 'Equip'
    action.disabled = item === player.equipped || item === 'irrigation' || posting
    action.onclick = () => void submit(Command.cases.Equip.make({ tool: item }))
  } else {
    const locked = requires !== null && !player.tools.includes(requires)
    action.textContent = `Buy · ${price} coins`
    action.disabled = posting || locked || player.coins < price
    action.onclick = () => void submit(Command.cases.Buy.make({ tool: item }))
  }
  action.setAttribute('aria-label', `${action.textContent} · ${labelText}`)
  const label = document.createElement('div')
  const description = document.createElement('small')
  const prerequisite =
    requires !== null && !owned && !player.tools.includes(requires)
      ? ` First buy the ${toolCatalog[requires].name}.`
      : ''
  description.textContent = `${details}${prerequisite}`
  label.append(title, description)
  row.append(label, action)
  return row
}

function renderPanel() {
  const player = session.view?.player ?? null
  if (!dialog.open) {
    return
  }
  if (panel === 'inventory' && player !== null) {
    const job = player.contract
    for (const [quarter, cell] of element('quarter-map').querySelectorAll('i').entries()) {
      cell.classList.toggle('target', quarter === job.quarter)
    }
    const irrigation = player.tools.includes('irrigation')
    element('watering-setting').hidden = !irrigation && !player.tools.includes('sprinkler')
    automaticWatering.checked = player.automaticWatering
    automaticWatering.disabled = posting
    const watering = toolCatalog[irrigation ? 'irrigation' : 'sprinkler']
    element('watering-rate').textContent = `${watering.name} · ${watering.cost} coins per dry tick while funds last.`
    element('job-name').textContent = job.description
    element('job-count').textContent = `${job.progress}/${job.target} · +${job.bonus} coins`
    const meter = byId('job-meter', HTMLProgressElement)
    meter.max = job.target
    meter.value = job.progress
    const item = nextUpgrade(player)
    element('next-upgrade').textContent = item === undefined ? 'All tools owned' : upgradeGoal(player, item)
    element('progress').textContent = `${player.coins} coins · ${player.xp} XP`
    const home = Option.getOrUndefined(Arr.findFirst(session.view?.lots ?? [], (lot) => lot.id === player.lot))
    if (home !== undefined) {
      const { moisture, fertility, disease, height, weeds, leaves } = home.lawn
      element('condition').textContent =
        `Curb appeal ${home.appeal}/100 · Height ${height}/100 · Moisture ${moisture}% · Fertility ${fertility}% · Disease ${disease}% · Weeds ${weeds}% · Leaves ${leaves}%`
    }
    const season = session.view?.season ?? 'autumn'
    const chores = {
      spring: 'Weeds sprout between the grass blades. Mow the yellow flowers to restore curb appeal.',
      summer: 'Watch for new weeds. A mower cuts them along with the grass.',
      autumn: 'Leaves fall on the block. Bag them with your rake or blow them over a property line.',
      winter: 'Grass grows slowly. Clear any piles left from autumn.',
    }
    const nextSeason = { autumn: 'Winter', winter: 'Spring', spring: 'Summer', summer: 'Autumn' }[season]
    const nextSeasonAt = session.view?.nextSeasonAt ?? 0
    const change = nextSeasonAt > 0 ? ` ${nextSeason} starts at ${seasonTime.format(nextSeasonAt)}.` : ''
    element('season-note').textContent = `${Str.capitalize(season)} · ${chores[season]}${change}`
    const delivery = player.lastDelivery
    const lastHit = element('last-leaf-delivery')
    lastHit.hidden = delivery === undefined
    if (delivery !== undefined) {
      lastHit.textContent = `Last leaf delivery: ${delivery.sender} at ${addressOf(delivery.senderLot)} sent you ${delivery.amount} leaves.`
    }
    element('tools').replaceChildren(...Arr.map(Records.keys(toolCatalog), (item) => toolRow(item, player)))
    patternField.replaceChildren(
      ...Arr.map(patternOrder, (key) => {
        const option = document.createElement('option')
        option.value = key
        option.disabled = player.xp < patterns[key].xp
        option.textContent = option.disabled ? `${patterns[key].name} · ${patterns[key].xp} XP` : patterns[key].name
        return option
      })
    )
    patternField.value = player.pattern
    patternField.disabled = posting
  } else if (panel === 'directory' && session.view !== undefined) {
    renderInspection(session.view)
    element('rankings').replaceChildren(
      ...Arr.map(
        Arr.sort(
          session.view.lots,
          Order.make<LotView>((a, b) => Order.Number(b.appeal, a.appeal) || Order.Number(a.id, b.id))
        ),
        (lot) => {
          const row = document.createElement('li')
          const label = document.createElement('span')
          label.textContent = lot.name
          const address = document.createElement('small')
          address.textContent = `${addressOf(lot.id)} · ${lot.bot ? 'Bot lawn' : lot.id === player?.lot ? 'Your lawn' : 'Resident'}`
          const score = document.createElement('strong')
          score.textContent = String(lot.appeal)
          label.append(address)
          row.append(label, score)
          return row
        }
      )
    )
  }
}

function openPanel(next: typeof panel) {
  chat.close()
  panel = next
  if (element('stage').contains(document.pointerLockElement)) {
    document.exitPointerLock()
  }
  session.world?.setWorkingEnabled(false)
  element('stage').inert = true
  const titles = {
    claim: 'Move to Clover Lane',
    inventory: 'Tool shed',
    directory: 'Neighbors',
    controls: 'Controls',
  }
  element('panel-title').textContent = titles[next]
  for (const id of Records.keys(titles)) {
    element(id).hidden = id !== next
  }
  element('panel-notice').textContent = ''
  dialog.showModal()
  renderPanel()
  if (next === 'claim') {
    name.focus()
  }
}

function accept(next: BlockView) {
  if (session.view !== undefined && sameView(session.view, next)) {
    return
  }
  const previous = session.view
  session.view = next
  renderDeadline()
  if (previous !== undefined && previous.nextJudgingAt < next.nextJudgingAt && next.yardWinner !== null) {
    const winner = Option.getOrUndefined(Arr.findFirst(next.lots, (lot) => lot.id === next.yardWinner))
    if (winner !== undefined) {
      message(`Karen awarded Yard of the Week to ${winner.name} at ${addressOf(winner.id)}.`)
    }
  }
  if (
    next.player !== null &&
    previous?.player?.hoa.failures !== next.player.hoa.failures &&
    homeLot(next)?.hoa.lastResult === 'cited'
  ) {
    const fine = next.player.hoa.lastFine
    message(`Karen issued a citation: ${fine} ${fine === 1 ? 'coin' : 'coins'} deducted.`)
  }
  chat.updateAccess()
  session.world?.setBlock(next)
  const delivery = next.player?.lastDelivery
  if (
    next.player !== null &&
    delivery !== undefined &&
    previous?.player?.lot === next.player.lot &&
    previous.player.lastDelivery?.id !== delivery.id
  ) {
    message(`${delivery.sender} blew ${delivery.amount} leaves onto your lawn!`)
    session.world?.blowLeaves(
      delivery.senderLot,
      delivery.sourceCell,
      next.player.lot,
      delivery.landingCell,
      delivery.amount
    )
  }
  if (next.player !== null) {
    session.world?.setTool(next.player.equipped)
  }
  session.world?.setWorkingEnabled(Boolean(next.player) && !element('stage').inert)
  renderHud()
  renderPanel()
}

function refresh() {
  if (polling || posting || document.hidden) {
    return
  }
  polling = true
  const ticket = generation
  void readBlock()
    .then((next) => {
      if (ticket === generation) {
        const reconnecting = document.body.hasAttribute('data-offline')
        accept(next)
        if (reconnecting) {
          renderHud()
        }
        document.body.removeAttribute('data-offline')
      }
    })
    .catch(() => {
      if (ticket === generation) {
        document.body.setAttribute('data-offline', '')
        element('weather').textContent = 'Reconnecting…'
      }
    })
    .finally(() => {
      polling = false
    })
}

function submit(command: Command) {
  if (posting) {
    if (Command.guards.Equip(command) && command.tool === null) {
      putAwayAfterPost = true
    }
    return
  }
  posting = true
  generation++
  renderLauncher()
  renderPanel()
  void sendCommand(command)
    .then((result) => {
      if (result.view !== undefined) {
        accept(result.view)
      }
      if (result.reason !== null) {
        if (result.reason !== 'no-change' || performance.now() >= receiptUntil) {
          message(reasons[result.reason])
        }
      } else if (Command.guards.Claim(command)) {
        dialog.close()
        message(`Welcome to ${addressOf(command.lot)}.`)
      } else if (Command.guards.Buy(command)) {
        message(`${toolCatalog[command.tool].name} purchased.`)
      } else if (Command.guards.Equip(command)) {
        dialog.close()
        message(command.tool === null ? 'Tool put away.' : `${toolCatalog[command.tool].name} equipped.`)
      } else if (Command.guards.SetWatering(command)) {
        message(command.enabled ? 'Automatic watering on.' : 'Automatic watering off.')
      } else if (Command.guards.SetPattern(command)) {
        message(`${patterns[command.pattern].name} selected.`)
      } else if (result.view?.receipt !== undefined) {
        const { gross, cost, bonus, leafDestination, leafCell, leafAmount, leafSourceCell, fine } = result.view.receipt
        receiptUntil = performance.now() + 1800
        const net = gross - cost + bonus - (fine ?? 0)
        const job = bonus > 0 ? ` · Job bonus +${bonus}` : ''
        const source = Command.guards.Work(command) ? command.cell : leafSourceCell
        const sender = result.view.player
        if (
          source !== undefined &&
          sender !== null &&
          leafDestination !== undefined &&
          leafCell !== undefined &&
          leafAmount !== undefined
        ) {
          session.world?.blowLeaves(sender.lot, source, leafDestination, leafCell, leafAmount)
        }
        if (Command.guards.ReturnPile(command)) {
          message(`Returned ${leafAmount ?? 0} leaves to ${addressOf(command.senderLot)}. Fuel: ${cost}.`)
        } else if (Command.guards.SweepLeaves(command)) {
          message(`Swept ${leafAmount ?? 0} leaves into your bag. Fuel: ${cost}.`)
        } else if (leafDestination === 0) {
          message(`Karen caught you blowing leaves onto her lawn. HOA fine: ${fine ?? 0} coins. Fuel: ${cost}.`)
        } else if (leafDestination !== undefined && leafDestination !== result.view.player?.lot) {
          const target = Option.getOrUndefined(Arr.findFirst(result.view.lots, (lot) => lot.id === leafDestination))
          message(
            `${leafAmount ?? 0} leaves landed on ${target?.name ?? addressOf(leafDestination)}’s lawn. Fuel: ${cost}.`
          )
        } else {
          message(`${net >= 0 ? '+' : ''}${net} coins · ${gross} earned − ${cost} supplies${job}`)
        }
      }
      document.body.removeAttribute('data-offline')
    })
    .catch(() => {
      message('Connection lost. Check your lawn before you try again.')
    })
    .finally(() => {
      posting = false
      renderLauncher()
      renderPanel()
      if (putAwayAfterPost) {
        putAwayAfterPost = false
        if ((session.view?.player?.equipped ?? null) !== null) {
          submit(Command.cases.Equip.make({ tool: null }))
        }
      }
    })
}

function presence() {
  if (presencePending || session.view === undefined || document.hidden) {
    return
  }
  presencePending = true
  const playerLot = session.view.player?.lot
  void syncPresence(playerLot === undefined ? undefined : session.pose)
    .then((next) => {
      if (session.view?.player?.lot !== playerLot) {
        return
      }
      peers = next
      presenceKnown = true
      session.world?.setPeers(peers)
    })
    .catch(() => {
      presenceKnown = false
    })
    .finally(() => {
      presencePending = false
      updateOnline()
    })
}

function moveIn() {
  if (button('move-in').hidden === true || session.focused === undefined) {
    return
  }
  session.claiming = session.focused
  element('claim-address').textContent = addressOf(session.claiming)
  openPanel('claim')
}
targetField.onchange = () => {
  renderHud()
  element('stage').querySelector('canvas')?.focus()
}
button('move-in').onclick = moveIn
button('visit-karen').onclick = () => {
  dialog.close()
  session.world?.visitEstate()
}
button('neighbors').onclick = () => openPanel('directory')
button('hand-slot').onclick = () => {
  if ((session.view?.player?.equipped ?? null) !== null) {
    void submit(Command.cases.Equip.make({ tool: null }))
    element('stage').querySelector('canvas')?.focus()
  } else {
    openPanel('inventory')
  }
}
button('shed').onclick = () => openPanel('inventory')
button('camera').onclick = () => {
  session.world?.toggleCamera()
  element('stage').querySelector('canvas')?.focus()
}
button('help').onclick = () => openPanel('controls')
button('close').onclick = () => dialog.close()
dialog.onclose = () => {
  element('stage').inert = false
  session.world?.setWorkingEnabled(Boolean(session.view?.player))
  element('stage').querySelector('canvas')?.focus()
}
claim.onsubmit = (event) => {
  event.preventDefault()
  if (session.claiming === undefined) {
    return
  }
  const value = Schema.decodeOption(Command.cases.Claim)(
    Command.cases.Claim.make(
      {
        lot: session.claiming,
        name: Str.trim(name.value),
      },
      { disableChecks: true }
    )
  )
  if (Option.isSome(value)) {
    void submit(value.value)
  } else {
    message('Start with a letter or number. Use up to 20 letters, numbers, spaces, periods, hyphens, or apostrophes.')
  }
}
automaticWatering.onchange = () => {
  void submit(Command.cases.SetWatering.make({ enabled: automaticWatering.checked }))
}
patternField.onchange = () => {
  const pattern = Option.getOrElse(
    Arr.findFirst(patternOrder, (key) => key === patternField.value),
    (): Pattern => 'straight'
  )
  void submit(Command.cases.SetPattern.make({ pattern }))
}
document.addEventListener('keydown', (event) => {
  if (
    element('stage').inert ||
    event.target === targetField ||
    dialog.open ||
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return
  }
  if (
    (event.key === 'Enter' || event.code === 'KeyT') &&
    (event.target === document.body || event.composedPath().includes(element('stage')))
  ) {
    event.preventDefault()
    chat.open()
    return
  }
  if (element('leaf-launch').hidden === false && event.code === 'KeyG') {
    event.preventDefault()
    if (document.pointerLockElement !== null) {
      document.exitPointerLock()
    }
    targetField.focus()
  }
  if (event.code === 'KeyX' && (session.view?.player?.equipped ?? null) !== null) {
    button('hand-slot').click()
  }
  if (event.code === 'KeyV') {
    session.world?.toggleCamera()
  }
  if (event.code === 'KeyF') {
    moveIn()
  }
  if (event.code === 'KeyN') {
    openPanel('directory')
  }
  if (event.code === 'KeyH') {
    openPanel('controls')
  }
  if (event.code === 'KeyB' && session.view?.player?.lot !== undefined) {
    openPanel('inventory')
  }
})
void refresh()
window.setInterval(renderDeadline, 1000)
window.setInterval(() => void refresh(), 2500)
window.setInterval(() => void presence(), 300)

try {
  session.world = await createWorld(element('stage'), {
    onActivity: (item, working, walking) => sound.update(item, working, walking && !(working && item === 'riding')),
    onMove: (next) => {
      session.pose = next
    },
    onReturnFocus: (senderLot) => {
      if (senderLot === null) {
        delete session.returnSender
      } else {
        session.returnSender = senderLot
      }
      renderHud()
    },
    onReturnPile: (cell, senderLot, id) => {
      if (!posting && !element('stage').inert) {
        void submit(Command.cases.ReturnPile.make({ cell, senderLot, id }))
      }
    },
    onLeafLaunch: () => {
      if (!posting && !element('stage').inert && element('leaf-launch').hidden === false && sendingLeaves()) {
        void submit(Command.cases.LaunchLeaves.make({ destination: Number(targetField.value) }))
      }
    },
    onWork: (lot, cell, direction) => {
      const player = session.view?.player
      if (
        player === null ||
        player === undefined ||
        player.equipped === null ||
        posting ||
        element('stage').inert ||
        lot !== player.lot ||
        performance.now() < nextWork
      ) {
        return
      }
      nextWork = performance.now() + 105
      if (player.equipped === 'handheld-blower' || player.equipped === 'backpack-blower') {
        if (sendingLeaves()) {
          return
        }
        if (targetField.value !== 'forward') {
          void submit(Command.cases.SweepLeaves.make({ cell }))
          return
        }
      }
      void submit(Command.cases.Work.make({ lot, cell, tool: player.equipped, pattern: player.pattern, direction }))
    },
    onFocus: (lot) => {
      if (lot === null) {
        delete session.focused
      } else {
        session.focused = lot
      }
      focusHint()
    },
  })
  if (session.view !== undefined) {
    session.world.setBlock(session.view)
    renderLauncher()
  }
  if (session.view?.player?.equipped !== undefined) {
    session.world.setTool(session.view.player.equipped)
  }
  session.world.setPeers(peers)
  session.world.setWorkingEnabled(Boolean(session.view?.player) && !element('stage').inert)
} catch {
  element('graphics-error').hidden = false
}
