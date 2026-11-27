import {
  CommandRejected,
  MedalUnlocked,
  Game,
  findTunnelPartner,
  ItemCrafted,
  ItemDelivered,
  MilestoneCompleted,
  applyEdits,
  clockwise,
  columns,
  boardBounds,
  inBounds,
  enqueue,
  exportSave,
  initialResources,
  key,
  milestone,
  milestoneFor,
  offsets,
  rows,
  simulation,
  step,
} from '@garage/beltworks-domain'
import type { Cell, Command, Direction } from '@garage/beltworks-domain'
import { FixedLoop, Result } from '@typeonce/ritmo'
import { BrowserTickSource } from '@typeonce/ritmo-browser'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'
import { Application, Graphics, Point } from 'pixi.js'

import { Burst, draw, createBoard, stats } from './board.ts'
import { expansionCamera } from './camera.ts'
import type { Camera } from './camera.ts'
import { cloud, leaderboardPlayerId, readSharedFactory } from './cloud.ts'
import { editHistory } from './history.ts'
import { element, hud } from './hud.ts'
import { factoryInspection } from './inspection.ts'
import { inspectCell } from './inspector.ts'
import { setupLeaderboard } from './leaderboard.ts'
import { label, Machine, tile, oreColor } from './machines.ts'
import { medalInfo } from './medals.ts'
import { minimap } from './minimap.ts'
import { combinerPorts, starterGuide } from './onboarding.ts'
import { beltPath } from './path.ts'
import { pinchCamera } from './pinch.ts'
import { loadBoard, saveBoard } from './storage.ts'
import { ghostState, pickToolForBuilding, placement, tools, tunnelPreview } from './tools.ts'
import type { Tool } from './tools.ts'
import { watchUpdates, saveAndReload } from './updates.ts'

import './feedback.css'

declare const __BELTWORKS_BUILD_ID__: string

const field = element('field')
const app = new Application()
await app.init({
  resizeTo: field,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
  antialias: true,
  background: 0x0a_10_16,
  autoStart: false,
})
field.append(app.canvas)
const board = createBoard()
app.stage.addChild(board.world)
const made = Game.Runtime.make({ services: board.services, resources: initialResources() })
if (!made.ok) {
  throw new Error('Invalid initial factory')
}
const runtime = made.value
const history = editHistory(runtime)
const undoButton = element('undo')
const storage = () => window.localStorage
const localRevision = loadBoard(storage)(runtime)
const inspection = factoryInspection(runtime)
const sync = cloud({ runtime, getSave: inspection.getSave })
let editedSinceStart = false
runtime.tick(draw)
let view = runtime.inspect(stats)
let tool: Tool = 'extractor'
let facing: Direction = 'E'
let hovered = Option.none<Cell>()
const ghost = board.preview.addChild(new Machine())
const border = board.preview.addChild(new Graphics())
const portColors = { a: 0x68_e4_f4, b: 0xff_c5_65, output: 0x87_ff_d6 }
const portLabels = {
  a: board.preview.addChild(label({ text: '', size: 15, fill: portColors.a })),
  b: board.preview.addChild(label({ text: '', size: 15, fill: portColors.b })),
  output: board.preview.addChild(label({ text: '', size: 19, fill: portColors.output })),
}
function previewPorts(cell: Cell, dir: Direction) {
  const ports = combinerPorts({ cell, facing: dir })
  for (const name of ['a', 'b', 'output'] as const) {
    const port = ports[name]
    const dx = (port.gx - cell.gx) * (name === 'output' ? 1 : -1)
    const dy = (port.gy - cell.gy) * (name === 'output' ? 1 : -1)
    const arrow = dx > 0 ? '→' : dx < 0 ? '←' : dy > 0 ? '↓' : '↑'
    const x = (port.gx + 0.5) * tile
    const y = (port.gy + 0.5) * tile
    border
      .roundRect(x - 20, y - 12, 40, 24, 6)
      .setFillStyle({ color: 0x10_1a_24, alpha: 0.92 })
      .fill()
      .stroke({ color: portColors[name], width: 1.5 })
    const marker = portLabels[name]
    marker.text = { output: arrow, a: 'A ' + arrow, b: arrow + ' B' }[name]
    marker.position.set(x, y)
    marker.visible = true
  }
}
function area({ start, end }: { start: Cell; end: Cell }) {
  return {
    minX: Math.min(start.gx, end.gx),
    maxX: Math.max(start.gx, end.gx),
    minY: Math.min(start.gy, end.gy),
    maxY: Math.max(start.gy, end.gy),
  }
}

let eraseStart = Option.none<Cell>()
const measurement = element('measurement')
let beltDrag = Option.none<{ bounds: ReturnType<typeof area>; placed: number }>()
function measure(width: number, height: number, count: number, unit: string) {
  measurement.textContent = width + '×' + height + ' · ' + count + ' ' + unit + (count === 1 ? '' : 's')
  measurement.hidden = false
}
let selectedBeacon = Option.none<Cell>()
function primaryTarget() {
  return milestoneFor(view.p).requirements[0]?.value ?? 1
}
const tunnelAt = (cell: Cell) => tunnelPreview({ cell, facing, at: board.buildingAt(view.index.buildings) })
function link(cell: Cell, partner: Cell) {
  const x = (cell.gx + 0.5) * tile,
    y = (cell.gy + 0.5) * tile
  const dx = (partner.gx - cell.gx) * tile,
    dy = (partner.gy - cell.gy) * tile
  const length = Math.hypot(dx, dy)
  for (let offset = 0; offset < length; offset += 12) {
    const end = Math.min(length, offset + 7)
    border
      .moveTo(x + (dx * offset) / length, y + (dy * offset) / length)
      .lineTo(x + (dx * end) / length, y + (dy * end) / length)
  }
  border.stroke({ width: 2, alpha: 0.65, color: 0x61_e7_ef })
}
const inspector = element('inspector')
const rotateButton = element('rotate')
const rotateLabel = document.createTextNode('')
rotateButton.replaceChildren(...rotateButton.querySelectorAll('svg'), rotateLabel)
function inspectHover() {
  const info = Option.isSome(hovered) ? inspectCell({ cell: hovered.value, board, p: view.p, index: view.index }) : ''
  if (inspector.textContent !== info) {
    inspector.textContent = info
  }
}
let boardChanged = true
function preview() {
  boardChanged = true
  inspectHover()
  board.setBeaconFocus(Option.getOrUndefined(hovered), Option.getOrUndefined(selectedBeacon))
  const direction = element('direction')
  direction.hidden = tool === 'select' || tool === 'erase' || tool === 'trash'
  direction.textContent = tool === 'beacon' ? 'Boosts Extractors and Combiners' : 'Facing ' + facing + ' · R to rotate'
  rotateButton.hidden = direction.hidden || tool === 'beacon'
  if (rotateLabel.data !== facing) {
    rotateLabel.data = facing
    rotateButton.setAttribute('aria-label', 'Rotate clockwise. Facing ' + facing)
  }
  for (const marker of Rec.values(portLabels)) {
    marker.visible = false
  }
  board.beaconPreview.visible = false
  ghost.visible = false
  border.clear()
  measurement.hidden = true
  const stroke = Option.getOrUndefined(pendingStroke)
  if (stroke?.tool === 'belt' && Option.isSome(stroke.cell) && stroke.route.length > 0) {
    border.moveTo((stroke.cell.value.gx + 0.5) * tile, (stroke.cell.value.gy + 0.5) * tile)
    for (const cell of stroke.route) {
      border.lineTo((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile)
    }
    border.stroke({ width: 4, color: 0x7c_e3_b6, alpha: 0.8 })
  }
  if (Option.isSome(beltDrag)) {
    const { minX, maxX, minY, maxY } = beltDrag.value.bounds
    measure(maxX - minX + 1, maxY - minY + 1, beltDrag.value.placed, 'new belt')
  }
  const at = board.buildingAt(view.index.buildings)
  for (const node of board.buildings.children) {
    if (node.state.kind !== 'tunnelIn') {
      continue
    }
    const cell = { gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) }
    const partner = findTunnelPartner({ cell, facing: node.facing, at })
    if (
      partner !== undefined &&
      (tool === 'tunnel' || Option.exists(hovered, (h) => key(h) === key(cell) || key(h) === key(partner)))
    ) {
      link(cell, partner)
    }
  }
  if (Option.isNone(hovered)) {
    return
  }
  if (Option.isSome(eraseStart)) {
    const { minX, maxX, minY, maxY } = area({ start: eraseStart.value, end: hovered.value })
    const w = maxX - minX + 1,
      h = maxY - minY + 1
    border
      .rect(minX * tile, minY * tile, w * tile, h * tile)
      .setFillStyle({ color: 0xe5_4a_48, alpha: 0.3 })
      .fill()
      .stroke({ width: 3, color: 0xff_79_75 })
    let count = 0
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const machine = machineAt({ gx, gy })
        if (machine !== undefined && machine.state.kind !== 'hub') {
          count++
        }
      }
    }
    measure(w, h, count, 'building')
    return
  }
  if (tool === 'select') {
    return
  }
  const k = key(hovered.value),
    occupied = view.index.buildings[k] !== undefined
  const valid =
    tool === 'erase'
      ? occupied && machineAt(hovered.value)?.state.kind !== 'hub'
      : Arr.some(tools, (item) => item.id === tool && item.unlock <= view.p.milestoneIndex) &&
        inBounds(hovered.value, view.p.boardTier) &&
        (!occupied || (tool === 'belt' && machineAt(hovered.value)?.state.kind === 'belt')) &&
        (tool !== 'extractor' || view.index.veins[k] !== undefined)
  const color = valid ? 0x7c_e3_b6 : 0xf1_7a_75
  const x = (hovered.value.gx + 0.5) * tile,
    y = (hovered.value.gy + 0.5) * tile
  const wash = { color, alpha: 0.16 }
  border
    .roundRect(x - 23, y - 23, 46, 46, 5)
    .setFillStyle(wash)
    .fill()
    .stroke({ width: 2, color })
  const tunnel = tool === 'tunnel' ? tunnelAt(hovered.value) : undefined
  if (valid && tunnel?.partner !== undefined) {
    link(hovered.value, tunnel.partner)
  }
  const state = ghostState({
    tool: tool === 'tunnel' ? (tunnel?.kind ?? 'tunnelIn') : tool,
    targetValue: primaryTarget(),
  })
  if (Option.isSome(state)) {
    ghost.update(state.value, facing)
    ghost.animate(view.tick, view.p)
    ghost.alpha = 0.67
    ghost.tint = color
    ghost.position.set(x, y)
    ghost.visible = true
    if (state.value.kind === 'beacon') {
      board.beaconPreview.position.set(x, y)
      board.beaconPreview.visible = true
    }
    if (state.value.kind === 'combiner') {
      previewPorts(hovered.value, facing)
    }
  }
}
function choose(t: Tool) {
  if (inspection.visiting && t !== 'select') {
    return
  }
  brush = Option.none()
  beltDrag = Option.none()
  selectedBeacon = Option.none()
  element('filter-picker').hidden = true
  eraseStart = Option.none()
  tool = t
  updateHud(view.p, t)
  preview()
}
const updateHud = hud({
  veins: () =>
    Arr.map(
      Arr.filter(board.veins.children, (vein) => vein.visible),
      (vein) => Number(vein.label)
    ),
  choose,
  ascend: (mutator) => edit({ type: 'ascendBoard', mutator }),
  buyMeta: (upgrade) => edit({ type: 'buyMetaUpgrade', upgrade }),
  expand: () => edit({ type: 'expandBoard' }),
  buy: (u) => edit({ type: 'buyUpgrade', upgrade: u }),
})
let noticeTimer = 0
function notify(message: string) {
  element('notice').textContent = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    element('notice').textContent = ''
  }, 2600)
}
let bannerTimer = 0
function milestoneBanner(index: number, bonus: number) {
  const banner = element('milestone-banner')
  element('milestone-title').textContent = 'Milestone ' + (index + 1) + ' Complete! · +' + bonus + ' ✦ Bonus'
  element('milestone-reward').textContent =
    index === 0 ? 'Unlocked Adder (+) & Speed Upgrades' : milestone(index).reward
  element('quick-upgrade').hidden = index !== 0
  banner.hidden = false
  window.clearTimeout(bannerTimer)
  bannerTimer = window.setTimeout(() => {
    banner.hidden = true
  }, 5000)
}
const filterForm = element('filter-picker')
const filterInput = document.querySelector<HTMLInputElement>('input#filter-value')
if (filterInput === null) {
  throw new Error('Missing filter input')
}
const valueInput = filterInput
let filterCell = Option.none<Cell>()
function applyFilter(value: number) {
  if (Option.isNone(filterCell) || !Number.isInteger(value) || value < 1 || value > 999) {
    return
  }
  edit({ type: 'setFilter', ...filterCell.value, targetValue: value })
  filterForm.hidden = true
  valueInput.blur()
}
filterForm.onsubmit = (e) => {
  e.preventDefault()
  applyFilter(valueInput.valueAsNumber)
}
function openFilter(cell: Cell, value: number) {
  filterCell = Option.some(cell)
  const targets = Arr.map(milestoneFor(view.p).requirements, (r) => r.value)
  const values = Arr.dedupe([...targets, ...Arr.map(Rec.keys(view.p.vault), Number)])
  element('filter-values').replaceChildren(
    ...Arr.map(
      Arr.filter(values, (n) => n >= 1 && n <= 999),
      (n) => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.textContent = String(n)
        chip.onclick = () => applyFilter(n)
        return chip
      }
    )
  )
  valueInput.value = String(value)
  filterForm.hidden = false
  valueInput.focus()
  valueInput.select()
}
let flowLens = false
function toggleLens() {
  flowLens = !flowLens
  board.setFlowLens(flowLens)
  element('lens').setAttribute('aria-pressed', String(flowLens))
  animateBoard()
}
element('lens').onclick = toggleLens
let audio = Option.none<AudioContext>()
let sound = true
function activateAudio() {
  if (!sound || typeof AudioContext === 'undefined' || navigator.userActivation?.isActive === false) {
    return
  }
  const context = Option.getOrElse(audio, () => new AudioContext())
  audio = Option.some(context)
  if (context.state !== 'running') {
    void context.resume().catch(() => {})
  }
}
window.addEventListener('pointerdown', activateAudio, true)
window.addEventListener('pointerup', activateAudio, true)
window.addEventListener('click', activateAudio, true)
window.addEventListener('keydown', activateAudio, true)
function updateSoundControl() {
  control(
    'sound',
    sound ? 'Sound on' : 'Sound off',
    sound ? 'M3 9h4l5-4v12l-5-4H3z M15 8q4 3 0 6m2-9q7 6 0 12' : 'M3 9h4l5-4v12l-5-4H3z M15 9l4 4m0-4-4 4'
  )
  element('sound').setAttribute('aria-pressed', String(sound))
}
updateSoundControl()
element('sound').onclick = () => {
  sound = !sound
  if (sound) {
    activateAudio()
  } else if (Option.isSome(audio)) {
    void audio.value.close().catch(() => {})
    audio = Option.none()
  }
  updateSoundControl()
}
function control(id: string, title: string, path?: string) {
  const button = element(id),
    caption = button.querySelector('span')
  if (caption !== null) {
    caption.textContent = title
  }
  if (path !== undefined) {
    button.querySelector('path')?.setAttribute('d', path)
  }
}
function chime(hz: number, delay = 0, duration = 0.19, type: OscillatorType = 'sine') {
  if (!sound || Option.isNone(audio) || audio.value.state !== 'running') {
    return
  }
  const tone = audio.value.createOscillator(),
    gain = audio.value.createGain()
  const start = audio.value.currentTime + delay
  tone.type = type
  tone.frequency.value = hz
  gain.gain.setValueAtTime(0.032, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  tone.connect(gain).connect(audio.value.destination)
  tone.start(start)
  tone.stop(start + duration + 0.01)
}
const scale = [440, 493.88, 554.37, 659.25, 739.99]
function beltNote(tileIndex: number, delay = 0) {
  const degree = Math.min(tileIndex, 10)
  chime((scale[degree % 5] ?? 440) * 2 ** (Math.floor(degree / 5) - 1), delay, 0.075, 'triangle')
}
function celebrate(root = 440) {
  for (const [i, ratio] of [1, 1.25, 1.5, 2].entries()) {
    chime(root * ratio, i * 0.085, i === 3 ? 0.35 : 0.15)
  }
}
const hubX = (columns / 2) * tile
const hubY = (rows / 2) * tile
let lastDeliveryChime = -Infinity
let deliveryNote = 0
let lastIntake = -Infinity
function burst(x: number, y: number, count: number, color: number, ripple: 'none' | 'intake' | 'milestone') {
  const milestoneBurst = ripple === 'milestone'
  const reach = milestoneBurst ? 106 : 32
  const duration = milestoneBurst ? 820 : 420
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count + (performance.now() % 1000) / 1000
    const spark = new Burst(Math.cos(angle) * reach, Math.sin(angle) * reach, false, duration)
    spark.addChild(new Graphics()).poly([0, -5, 2.3, 0, 0, 5, -2.3, 0]).fill(color)
    spark.rotation = angle
    board.fx.addChild(spark).position.set(x, y)
  }
  if (ripple !== 'none') {
    const ring = new Burst(0, 0, true, duration)
    ring
      .addChild(new Graphics())
      .circle(0, 0, milestoneBurst ? 54 : 16)
      .stroke({ color, width: milestoneBurst ? 5 : 2 })
    board.fx.addChild(ring).position.set(x, y)
  }
}
let rejected = false
const observe = Game.Schedule(
  Game.System(
    'Beltworks/Feedback',
    {
      events: {
        delivery: Game.System.readEvent(ItemDelivered),
        craft: Game.System.readEvent(ItemCrafted),
        complete: Game.System.readEvent(MilestoneCompleted),
        medal: Game.System.readEvent(MedalUnlocked),
        reject: Game.System.readEvent(CommandRejected),
      },
    },
    ({ events }) => {
      for (const delivery of events.delivery.all()) {
        lastIntake = performance.now()
        const x = (delivery.gx + 0.5) * tile
        const y = (delivery.gy + 0.5) * tile
        const side = offsets[delivery.intakeSide]
        const edgeX = x + (side.gx * tile) / 2
        const edgeY = y + (side.gy * tile) / 2
        burst(edgeX, edgeY, 4, oreColor(delivery.value), 'intake')
        if (delivery.sparksEarned > 0) {
          const gain = new Burst(0, -38, false, 720)
          gain.addChild(label({ text: '+' + delivery.sparksEarned + ' ✦', size: 18, fill: 0xff_df_88 }))
          board.fx.addChild(gain).position.set(x, y - 12)
        }
        if (delivery.matchedTarget && lastIntake - lastDeliveryChime >= 110) {
          if (lastIntake - lastDeliveryChime >= 4000) {
            deliveryNote = 0
          }
          chime((scale[deliveryNote % 5] ?? 440) * (deliveryNote < 5 ? 1 : 2))
          deliveryNote = (deliveryNote + 1) % 8
          lastDeliveryChime = lastIntake
        }
      }
      for (const craft of events.craft.all()) {
        const color = oreColor(craft.result)
        burst(
          (craft.gx + 0.5) * tile,
          (craft.gy + 0.5) * tile,
          craft.firstTarget ? 10 : 4,
          color,
          craft.firstTarget ? 'intake' : 'none'
        )
        if (craft.firstTarget) {
          notify('First ' + craft.result + ' crafted!')
        }
      }
      for (const event of events.complete.all()) {
        burst(hubX, hubY, 20, 0xff_cd_58, 'milestone')
        celebrate()
        milestoneBanner(event.milestoneIndex, event.bonusSparks)
      }
      const medals = events.medal.all()
      if (medals.length > 0 && events.complete.all().length === 0) {
        notify(
          'Medal · ' +
            Arr.join(
              Arr.map(medals, (event) => medalInfo[event.medal][0]),
              ' + '
            )
        )
        celebrate(523.25)
      }
      for (const event of events.reject.all()) {
        rejected = true
        notify(event.reason)
      }
    }
  )
)
let dirty = false
let leaderboardRevision = 0
const hint = element('starter-hint')
const hintText = element('starter-message')
const dismissHint = element('dismiss-starter')
const guideArrows = board.preview.addChildAt(new Graphics(), 0)
let dismissedMilestone = Option.none<number>()
const quota = milestone(0).requirements[0]?.quota ?? 8
const touch = window.matchMedia('(pointer: coarse)')
const cellOf = (node: { x: number; y: number }) => ({ gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) })
function currentGuide() {
  if (inspection.visiting || view.p.milestoneIndex > 1) {
    return { step: 'hidden' } as const
  }
  const vein = (value: string) =>
    Option.map(
      Arr.findFirst(board.veins.children, (node) => node.visible && node.label === value),
      cellOf
    )
  const combiners = Arr.flatMap(board.buildings.children, (node) =>
    node.state.kind === 'combiner' ? [{ ...cellOf(node), dir: node.facing, op: node.state.op }] : []
  )
  return starterGuide({
    p: view.p,
    vein: vein('1'),
    two: vein('2'),
    combiners,
    dismissed: Option.contains(dismissedMilestone, view.p.milestoneIndex),
    at: board.buildingAt(view.index.buildings),
    hasThree: view.p.milestoneIndex === 1 && Arr.some(board.items.children, (item) => item.label === '3'),
  })
}
let guide = currentGuide()
dismissHint.onclick = () => {
  dismissedMilestone = Option.some(view.p.milestoneIndex)
  animateBoard()
}
function starterExtractor(cell: Cell) {
  if (
    guide.step !== 'extract' ||
    key(cell) !== key(guide.vein) ||
    (tool !== 'extractor' && tool !== 'select' && tool !== 'belt')
  ) {
    return false
  }
  const next = guide.nextTool
  facing = 'E'
  edit({ type: 'placeBuilding', kind: 'extractor', ...cell, dir: facing })
  if (!rejected) {
    choose(next)
    notify('Nice! Now drag belts right into the Hub')
  }
  return true
}
function animateBoard(updateGuide = true) {
  boardChanged = true
  if (updateGuide) {
    guide = currentGuide()
  }
  const message = {
    extract: '1. ' + (touch.matches ? 'Tap' : 'Click') + ' vein 1 to place Extractor',
    connect: '2. Drag belts right into the Hub',
    flowing: 'Flowing! Deliver ' + quota + ' to unlock Adder (+)',
    'mine-two': 'Mine vein 2 · Select Extractor',
    'place-adder': 'Place an Adder (+) facing north. Feed 1 into A (left) and 2 into B (right).',
    'back-belt': 'The back is blocked. Feed the Combiner from the left (A) and right (B).',
    recipe: '1 + 2 = 3 · Feed the side inputs. Send the output to the Hub.',
    waiting: '',
    hidden: '',
  }[guide.step]
  if (hintText.textContent !== message) {
    hintText.textContent = message
    hint.hidden = message.length === 0
    dismissHint.hidden = hint.hidden
    hint.dataset.step = guide.step
  }
  if (guideArrows.context.instructions.length > 0) {
    guideArrows.clear()
  }
  if (guide.step === 'place-adder') {
    for (const [cells, color] of [
      [guide.a, portColors.a],
      [guide.b, portColors.b],
    ] as const) {
      const first = cells[0]
      if (first === undefined) {
        continue
      }
      guideArrows.moveTo((first.gx + 0.5) * tile, (first.gy + 0.5) * tile)
      for (const cell of cells.slice(1)) {
        guideArrows.lineTo((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile)
      }
      guideArrows.stroke({ width: 6, color, alpha: 0.5 })
    }
    const x = (guide.cell.gx + 0.5) * tile,
      y = (guide.cell.gy + 0.5) * tile
    for (const offset of [-19, -4, 11]) {
      guideArrows
        .moveTo(x + offset, y - 19)
        .lineTo(x + offset + 8, y - 19)
        .moveTo(x + offset, y + 19)
        .lineTo(x + offset + 8, y + 19)
        .moveTo(x - 19, y + offset)
        .lineTo(x - 19, y + offset + 8)
        .moveTo(x + 19, y + offset)
        .lineTo(x + 19, y + offset + 8)
    }
    guideArrows
      .moveTo(x - 6, y)
      .lineTo(x + 6, y)
      .moveTo(x, y - 6)
      .lineTo(x, y + 6)
      .stroke({ color: portColors.output, width: 2, alpha: 0.8 })
  }
  if (guide.step === 'back-belt' || guide.step === 'mine-two') {
    const cell = guide.step === 'mine-two' ? guide.vein : guide.cell
    const pulse = 0.5 + 0.5 * Math.sin(view.tick * 0.07)
    guideArrows
      .circle((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile, 19 + 3 * pulse)
      .stroke({ color: portColors.b, width: 3, alpha: 0.6 + 0.4 * pulse })
  }
  if (guide.step === 'connect') {
    for (const cell of guide.cells) {
      const pulse = (view.tick % 45) / 45
      const x = (cell.gx + 0.5) * tile + pulse * 5 - 2.5
      const y = (cell.gy + 0.5) * tile
      guideArrows
        .moveTo(x - 17, y)
        .lineTo(x - 12, y)
        .moveTo(x - 7, y)
        .lineTo(x + 11, y)
        .moveTo(x + 3, y - 7)
        .lineTo(x + 11, y)
        .lineTo(x + 3, y + 7)
        .stroke({ color: 0x87_ff_d6, width: 3, alpha: 0.8 + 0.2 * Math.sin(pulse * Math.PI) })
    }
  }
  board.animate(view.tick, view.p, guide.step === 'extract')
}
function positionGuide() {
  if (guide.step === 'extract' || guide.step === 'mine-two') {
    const x = board.world.x + (guide.vein.gx + 0.5) * tile * board.world.scale.x
    const y = board.world.y + (guide.vein.gy - 0.25) * tile * board.world.scale.y
    hint.style.setProperty('--anchor-x', x + 'px')
    hint.style.setProperty('--anchor-y', y + 'px')
  }
}
function refresh(edited = false) {
  const previous = view
  view = runtime.inspect(stats)
  if (previous.p.milestoneIndex !== view.p.milestoneIndex || view.p.runTicks < previous.p.runTicks) {
    dismissedMilestone = Option.none()
  }
  if (!edited && view.p.contractIndex > previous.p.contractIndex) {
    celebrate(392)
  }
  if (edited) {
    map.invalidate()
    editedSinceStart = true
    board.tracks(view.index.buildings)
  }
  if (
    edited ||
    previous.p.deliveryWindow !== view.p.deliveryWindow ||
    previous.p.meta !== view.p.meta ||
    Math.floor(previous.p.runTicks / 60) !== Math.floor(view.p.runTicks / 60)
  ) {
    updateHud(view.p, tool)
  }
  if (
    previous.p.boardTier !== view.p.boardTier ||
    (previous.p.milestoneIndex === 0) !== (view.p.milestoneIndex === 0)
  ) {
    fitBoard(view.p.boardTier > previous.p.boardTier)
  }
  if (previous.index.buildings !== view.index.buildings || (previous.index !== view.index && Option.isSome(hovered))) {
    preview()
  }
  animateBoard(
    edited ||
      previous.p.milestoneIndex !== view.p.milestoneIndex ||
      previous.p.craftedTargets !== view.p.craftedTargets ||
      ((previous.p.delivered[1] ?? 0) === 0) !== ((view.p.delivered[1] ?? 0) === 0)
  )
  inspectHover()
  leaderboardRevision++
  dirty = true
}
function edit(command: Command) {
  if (inspection.visiting) {
    return
  }
  const tracked =
    command.type !== 'resetBoard' &&
    command.type !== 'expandBoard' &&
    command.type !== 'buyUpgrade' &&
    command.type !== 'ascendBoard' &&
    command.type !== 'buyMetaUpgrade'
  const snapshot = tracked ? exportSave(runtime) : undefined
  rejected = false
  enqueue(command)(runtime)
  runtime.tick(applyEdits, observe, draw)
  if (snapshot !== undefined && !rejected) {
    history.record(snapshot)
  }
  refresh(true)
  if (!rejected) {
    if (command.type === 'placeBuilding' && command.kind === 'belt') {
      beltNote(0)
    } else if (command.type === 'rotateBuilding' || command.type === 'placeBuilding') {
      chime(220, 0, 0.035, 'triangle')
    }
    if (command.type === 'placeBuilding' && command.kind === 'beacon') {
      notify('Belt any 2+ number into the Beacon to power its speed boost (higher numbers last longer)')
    }
    if (command.type === 'ascendBoard') {
      leaderboard.sync()
      history.clear()
      choose('extractor')
      celebrate()
    }
    if (command.type === 'expandBoard') {
      revealExpansion()
      notify('Workshop expanded · Ring ' + view.p.boardTier)
      celebrate(329.63)
    }
  }
  undoButton.toggleAttribute('disabled', !history.available)
}
function save(keepalive = false, force = false) {
  if (!dirty && !force) {
    return
  }
  return inspection.saveHome((home) => {
    const revision = Math.floor(performance.timeOrigin + performance.now())
    leaderboard.sync(true)
    if (saveBoard(storage)(home, revision)) {
      dirty = false
    } else {
      notify('Local save unavailable')
    }
    return sync.upload(revision, keepalive)
  })
}
let paused = false,
  speed = 1
function pause() {
  if (inspection.visiting) {
    return
  }
  paused = !paused
  control('pause', paused ? 'Play' : 'Pause', paused ? 'M6 3l12 8-12 8z' : 'M7 5v12m8-12v12')
}
element('pause').onclick = pause
element('speed').onclick = () => {
  if (inspection.visiting) {
    return
  }
  speed = speed === 4 ? 1 : speed * 2
  control('speed', speed + '×')
  element('speed').classList.toggle('active', speed > 1)
}
function confirmAction(id: string, title: string, confirm: string, action: () => void) {
  const button = element(id)
  let timer = 0
  button.onclick = () => {
    if (inspection.visiting) {
      return
    }
    if (timer !== 0) {
      window.clearTimeout(timer)
      timer = 0
      control(id, title)
      button.classList.remove('confirm')
      action()
      return
    }
    control(id, confirm)
    button.classList.add('confirm')
    timer = window.setTimeout(() => {
      timer = 0
      control(id, title)
      button.classList.remove('confirm')
    }, 3000)
  }
}
confirmAction('reset', 'Reset run', 'Confirm reset', () => {
  history.clear()
  edit({ type: 'resetBoard' })
  choose('extractor')
})
confirmAction('clear', 'Clear floor', 'Confirm clear', () => edit({ type: 'clearFloor' }))
function undo() {
  if (inspection.visiting || !history.undo()) {
    return
  }
  brush = Option.none()
  beltDrag = Option.none()
  eraseStart = Option.none()
  for (const node of board.fx.removeChildren()) {
    node.destroy({ children: true })
  }
  runtime.tick(draw)
  refresh(true)
  if (!Arr.some(tools, (t) => t.id === tool && t.unlock <= view.p.milestoneIndex)) {
    choose('extractor')
  }
  preview()
  undoButton.toggleAttribute('disabled', !history.available)
}
undoButton.onclick = undo
const canvas = app.canvas
function boardViewport() {
  const top = element('bar').getBoundingClientRect().bottom + 12
  document.documentElement.style.setProperty('--drawer-top', Math.max(74, top) + 'px')
  const w = Math.max(1, field.clientWidth),
    h = Math.max(1, element('toolbar').getBoundingClientRect().top - 12 - top)
  return { width: w, height: h, top }
}
let viewport = boardViewport()
const map = minimap({ board, viewport: () => viewport })
function positionMinimap() {
  const panels = [element('toolbar'), filterForm]
  const top = Math.min(
    ...Arr.map(
      Arr.filter(panels, (panel) => panel.hidden === false),
      (panel) => panel.getBoundingClientRect().top
    )
  )
  element('minimap').style.bottom = field.clientHeight - top + 12 + 'px'
}
const popupLayout = new ResizeObserver(positionMinimap)
popupLayout.observe(filterForm)
type Reveal = { from: Camera; to: Camera; start: number }
let reveal = Option.none<Reveal>()
const perimeter = board.preview.addChild(new Graphics())
function revealExpansion() {
  const { minX, maxX, minY, maxY } = boardBounds(view.p.boardTier)
  const w = (maxX - minX + 1) * tile
  const h = (maxY - minY + 1) * tile
  perimeter
    .clear()
    .roundRect(-w / 2, -h / 2, w, h, 8)
    .stroke({ color: 0x8f_ff_dc, width: 10, alpha: 0.25 })
    .roundRect(-w / 2, -h / 2, w, h, 8)
    .stroke({ color: 0xff_df_96, width: 3 })
  perimeter.position.set(hubX, hubY)
}
function fitBoard(animated: boolean) {
  map.cancelPan()
  viewport = boardViewport()
  map.invalidate()
  const { width: w, height: h, top } = viewport
  element('minimap').style.right = field.clientWidth - w + 8 + 'px'
  positionMinimap()
  const { minX, maxX, minY, maxY } = boardBounds(view.p.boardTier)
  const scale = Math.min(w / ((maxX - minX + 1) * tile + 40), h / ((maxY - minY + 1) * tile + 40))
  const to = { scale, x: (w - columns * tile * scale) / 2, y: top + (h - rows * tile * scale) / 2 }
  if (animated) {
    reveal = Option.some({
      from: { x: board.world.x, y: board.world.y, scale: board.world.scale.x },
      to,
      start: performance.now(),
    })
  } else {
    reveal = Option.none()
    board.world.scale.set(scale)
    board.world.position.set(to.x, to.y)
  }
  map.draw(view.p.boardTier)
  hovered = Option.none()
  preview()
}
function center() {
  fitBoard(false)
}
const layout = new ResizeObserver(() => {
  app.resize()
  center()
})
for (const panel of [field, element('bar'), element('toolbar')]) {
  layout.observe(panel)
}
element('center').onclick = center
const pointer = (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  return new Point(e.clientX - rect.left, e.clientY - rect.top)
}
function hover(e: MouseEvent) {
  measurement.style.left = Math.max(4, Math.min(window.innerWidth - 170, e.clientX + 14)) + 'px'
  measurement.style.top = Math.max(4, Math.min(window.innerHeight - 32, e.clientY + 16)) + 'px'
  const p = board.world.toLocal(pointer(e))
  const gx = Math.floor(p.x / tile),
    gy = Math.floor(p.y / tile)
  hovered = gx >= 0 && gy >= 0 && gx < columns && gy < rows ? Option.some({ gx, gy }) : Option.none()
  preview()
}
function minScale() {
  return Math.min(0.5, field.clientWidth / (columns * tile + 40), field.clientHeight / (rows * tile + 40))
}
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    reveal = Option.none()
    map.cancelPan()
    const p = pointer(e),
      local = board.world.toLocal(p)
    const scale = Math.min(2.5, Math.max(minScale(), board.world.scale.x * Math.exp(-e.deltaY * 0.0015)))
    board.world.scale.set(scale)
    board.world.position.set(p.x - local.x * scale, p.y - local.y * scale)
    hover(e)
  },
  { passive: false }
)
let pan = Option.none<{ start: Point; origin: Point; moved: boolean }>()
let recordBeltDrag = false
function machineAt(cell: Cell) {
  const id = view.index.buildings[key(cell)]
  return id === undefined ? undefined : board.machines.get(id)
}
let brush = Option.none<{ cell: Cell; dir: Direction }>()
canvas.oncontextmenu = (e) => e.preventDefault()
function beginEdit(cell: Cell) {
  if (inspection.visiting) {
    return
  }
  filterForm.hidden = true
  if (starterExtractor(cell)) {
    return
  }
  if (tool === 'erase') {
    eraseStart = Option.some(cell)
    preview()
    return
  }
  const machine = machineAt(cell)
  if (tool === 'select') {
    selectedBeacon = machine?.state.kind === 'beacon' ? Option.some(cell) : Option.none()
    preview()
    if (machine?.state.kind === 'filter') {
      openFilter(cell, machine.state.targetValue)
      return
    }
    if (machine === undefined || machine.state.kind === 'hub' || Option.isSome(selectedBeacon)) {
      return
    }
  }
  recordBeltDrag = tool === 'belt' && (machine?.state.kind === 'belt' || machine?.state.kind === 'extractor')
  if (recordBeltDrag && machine !== undefined) {
    beltDrag = Option.some({ bounds: area({ start: cell, end: cell }), placed: 0 })
    brush = Option.some({ cell, dir: machine.facing })
    preview()
    return
  }
  const empty = view.index.buildings[key(cell)] === undefined
  edit(
    placement(tool === 'tunnel' ? tunnelAt(cell).kind : tool)({
      cell,
      dir: facing,
      targetValue: primaryTarget(),
    })
  )
  if (tool === 'belt' && empty && inBounds(cell, view.p.boardTier)) {
    beltDrag = Option.some({ bounds: area({ start: cell, end: cell }), placed: 1 })
    brush = Option.some({ cell, dir: facing })
    preview()
  }
}
function extendBelt(cell: Cell) {
  if (inspection.visiting || Option.isNone(brush)) {
    return
  }
  const path = beltPath({
    start: brush.value.cell,
    end: cell,
    facing: brush.value.dir,
    laneAt: (cell) => {
      const machine = machineAt(cell)
      if (machine?.state.kind === 'belt') {
        return machine.facing
      }
      return machine === undefined && inBounds(cell, view.p.boardTier) ? 'empty' : 'blocked'
    },
  })
  if (Option.isSome(beltDrag)) {
    const bounds = beltDrag.value.bounds
    bounds.minX = Math.min(bounds.minX, path.cell.gx)
    bounds.maxX = Math.max(bounds.maxX, path.cell.gx)
    bounds.minY = Math.min(bounds.minY, path.cell.gy)
    bounds.maxY = Math.max(bounds.maxY, path.cell.gy)
    const placed = Arr.filter(path.commands, (c) => c.type === 'placeBuilding').length
    for (let i = 0; i < placed; i++) {
      beltNote(beltDrag.value.placed + i, i * 0.025)
    }
    beltDrag.value.placed += placed
    preview()
  }
  if (path.commands.length > 0) {
    if (recordBeltDrag) {
      history.record(exportSave(runtime))
      undoButton.removeAttribute('disabled')
      recordBeltDrag = false
    }
    for (const command of path.commands) {
      enqueue(command)(runtime)
    }
    runtime.tick(applyEdits, observe, draw)
    refresh(true)
  }
  brush = path.blocked ? Option.none() : Option.some({ cell: path.cell, dir: path.dir })
}
function clearStroke() {
  eraseStart = Option.none()
  beltDrag = Option.none()
  brush = Option.none()
  pan = Option.none()
  preview()
}

type TouchStroke = {
  start: Point
  origin: Point
  cell: Option.Option<Cell>
  tool: Tool
  route: Array<Cell>
  moved: boolean
}
let pendingStroke = Option.none<TouchStroke>()
const touches = MutableHashMap.empty<number, Point>()
function pair() {
  const [first, second] = MutableHashMap.values(touches)
  return first !== undefined && second !== undefined ? Option.some([first, second] as const) : Option.none()
}
function moveTouch(e: PointerEvent) {
  if (!MutableHashMap.has(touches, e.pointerId)) {
    return
  }
  const before = pair()
  const point = pointer(e)
  MutableHashMap.set(touches, e.pointerId, point)
  const after = pair()
  if (Option.isSome(before) && Option.isSome(after)) {
    const next = pinchCamera({
      before: before.value,
      after: after.value,
      camera: { x: board.world.x, y: board.world.y, scale: board.world.scale.x },
      minScale: minScale(),
      maxScale: 2.5,
    })
    board.world.scale.set(next.scale)
    board.world.position.set(next.x, next.y)
    return
  }
  const stroke = Option.getOrUndefined(pendingStroke)
  if (stroke === undefined || stroke.tool !== tool) {
    return
  }
  const dx = point.x - stroke.start.x,
    dy = point.y - stroke.start.y
  stroke.moved ||= Math.hypot(dx, dy) > 6
  if (tool === 'select' && stroke.moved) {
    board.world.position.set(stroke.origin.x + dx, stroke.origin.y + dy)
  }
  hover(e)
  if (tool === 'belt' && Option.isSome(hovered)) {
    const last = stroke.route.at(-1)
    if (last === undefined || key(last) !== key(hovered.value)) {
      stroke.route.push(hovered.value)
    }
  }
}

canvas.onpointerdown = (e) => {
  if (e.pointerType !== 'touch' && (!e.isPrimary || MutableHashMap.size(touches) > 0)) {
    return
  }
  map.cancelPan()
  reveal = Option.none()
  canvas.setPointerCapture(e.pointerId)
  if (e.pointerType === 'touch') {
    const start = pointer(e)
    MutableHashMap.set(touches, e.pointerId, start)
    if (MutableHashMap.size(touches) > 1) {
      pendingStroke = Option.none()
      hovered = Option.none()
      clearStroke()
      return
    }
    hover(e)
    pendingStroke = Option.some({
      start,
      origin: board.world.position.clone(),
      cell: hovered,
      tool,
      route: [],
      moved: false,
    })
    if (tool === 'erase') {
      eraseStart = hovered
    }
    preview()
    return
  }
  hover(e)
  if (e.button === 2 || e.button === 1 || (tool === 'select' && e.button === 0)) {
    pan = Option.some({ start: pointer(e), origin: board.world.position.clone(), moved: false })
  } else if (e.button === 0 && Option.isSome(hovered)) {
    beginEdit(hovered.value)
  }
}
canvas.onpointermove = (e) => {
  if (e.pointerType === 'touch') {
    moveTouch(e)
    return
  }
  if (!e.isPrimary || MutableHashMap.size(touches) > 0) {
    return
  }
  if (Option.isSome(pan)) {
    const p = pointer(e),
      dx = p.x - pan.value.start.x,
      dy = p.y - pan.value.start.y
    pan.value.moved ||= Math.hypot(dx, dy) > 6
    if (pan.value.moved) {
      board.world.position.set(pan.value.origin.x + dx, pan.value.origin.y + dy)
    }
  }
  hover(e)
  if (Option.isSome(hovered)) {
    extendBelt(hovered.value)
  }
}
canvas.onpointerup = (e) => {
  if (e.pointerType === 'touch') {
    if (!MutableHashMap.has(touches, e.pointerId)) {
      return
    }
    moveTouch(e)
    MutableHashMap.remove(touches, e.pointerId)
    const completed = Option.getOrUndefined(pendingStroke)
    pendingStroke = Option.none()
    if (completed === undefined || completed.tool !== tool || (tool === 'select' && completed.moved)) {
      clearStroke()
      return
    }
    if (Option.isSome(completed.cell)) {
      if (Option.isSome(hovered) && ghost.visible && ghost.state.kind === 'combiner') {
        beginEdit(hovered.value)
      } else {
        beginEdit(completed.cell.value)
      }
      for (const cell of completed.route) {
        extendBelt(cell)
      }
    }
  } else {
    if (!e.isPrimary || MutableHashMap.size(touches) > 0) {
      return
    }
    hover(e)
    if (e.button === 0 && tool === 'select' && Option.isSome(pan) && !pan.value.moved && Option.isSome(hovered)) {
      beginEdit(hovered.value)
    }
  }
  if (e.button === 0 && Option.isSome(eraseStart) && Option.isSome(hovered)) {
    edit({ type: 'removeArea', ...area({ start: eraseStart.value, end: hovered.value }) })
  }
  if (e.button === 2 && Option.isSome(pan) && !pan.value.moved && Option.isSome(hovered)) {
    edit({ ...hovered.value, type: 'removeBuilding' })
  }
  clearStroke()
}
canvas.onlostpointercapture = canvas.onpointercancel = (e) => {
  if (e.pointerType === 'touch') {
    if (!MutableHashMap.has(touches, e.pointerId)) {
      return
    }
    MutableHashMap.remove(touches, e.pointerId)
    pendingStroke = Option.none()
  }
  clearStroke()
}

canvas.onpointerleave = () => {
  hovered = Option.none()
  preview()
}
function rotateFacing() {
  facing = clockwise[facing]
  chime(220, 0, 0.035, 'triangle')
  preview()
}
rotateButton.onclick = rotateFacing
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog:modal') !== null) {
    return
  }
  const k = Str.toLowerCase(e.key)
  if (inspection.visiting && k !== 'h' && k !== 'v' && k !== '?') {
    return
  }
  if (k === 'escape' && document.querySelector(':popover-open') !== null) {
    return
  }
  if (filterForm.hidden === false && k === 'escape') {
    filterForm.hidden = true
    valueInput.blur()
    return
  }
  if (e.target === valueInput) {
    return
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && Str.toLowerCase(e.key) === 'z') {
    e.preventDefault()
    if (!e.repeat) {
      undo()
    }
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) {
    return
  }
  const hoveredState = Option.isSome(hovered) ? machineAt(hovered.value)?.state : undefined
  if (k === '?') {
    element('controls').togglePopover()
  } else if (k === 'v') {
    toggleLens()
  } else if (k === 'f' && Option.isSome(hovered) && hoveredState?.kind === 'filter') {
    openFilter(hovered.value, hoveredState.targetValue)
  } else if (k === ' ') {
    e.preventDefault()
    pause()
  } else if (k === 'q' && Option.isSome(hovered)) {
    const machine = machineAt(hovered.value)
    if (machine !== undefined) {
      const picked = pickToolForBuilding({ state: machine.state, milestoneIndex: view.p.milestoneIndex })
      if (Option.isSome(picked)) {
        facing = machine.facing
        choose(picked.value)
      }
    }
  } else if (k === 'h') {
    center()
  } else if (k === 'r') {
    if (tool === 'select' && Option.isSome(hovered)) {
      edit({ ...hovered.value, type: 'rotateBuilding' })
    } else {
      rotateFacing()
    }
    preview()
  } else {
    const t = Arr.findFirst(tools, (item) => Str.toLowerCase(item.key) === (k === 'escape' ? 'esc' : k))
    if (Option.isSome(t) && t.value.unlock <= view.p.milestoneIndex) {
      choose(t.value.id)
    }
  }
})
board.tracks(view.index.buildings)
animateBoard()
updateHud(view.p, tool)
center()
const updateNotice = element('update-notice')
watchUpdates({
  currentVersion: __BELTWORKS_BUILD_ID__,
  onUpdate: () => {
    updateNotice.hidden = false
  },
})
element('update-later').onclick = () => {
  updateNotice.hidden = true
}
element('update-reload').onclick = () => {
  updateNotice.hidden = true
  void saveAndReload({ save: () => save(false, true), reload: () => window.location.reload() })
}
window.setInterval(() => void save(), 5000)
window.addEventListener('pagehide', () => void save(true))
element('share').onclick = () => {
  void sync
    .shareLink()
    .then(notify)
    .catch(() => notify('Could not share factory'))
}
let homeView = Option.none<{ tool: Tool; camera: Camera; dismissed: typeof dismissedMilestone }>()
let inspectionRequest = 0
function redrawFactory(nextTool: Tool) {
  pendingStroke = Option.none()
  clearStroke()
  element('milestone-banner').hidden = true
  for (const node of board.fx.removeChildren()) {
    node.destroy({ children: true })
  }
  runtime.tick(draw)
  refresh(true)
  choose(nextTool)
  center()
  undoButton.toggleAttribute('disabled', inspection.visiting || !history.available)
  for (const id of ['clear', 'reset', 'speed', 'pause', 'open-workshop']) {
    element(id).toggleAttribute('disabled', inspection.visiting)
  }
}
const resumed = sync.load(() => !editedSinceStart, localRevision)
const leaderboard = setupLeaderboard({
  state: () => ({
    visiting: inspection.visiting,
    revision: leaderboardRevision,
    totalDelivered: view.p.totalDelivered,
    milestoneIndex: view.p.milestoneIndex,
    ascensions: view.p.meta.ascensions,
  }),
  getSave: inspection.getSave,
  playerId: leaderboardPlayerId(),
  inspect: (shareId, callsign) => {
    const request = ++inspectionRequest
    return Promise.all([readSharedFactory(shareId), resumed]).then(([shared]) => {
      if (request !== inspectionRequest) {
        return
      }
      void save()
      const camera = { scale: board.world.scale.x, x: board.world.x, y: board.world.y }
      inspection.enter(shared)
      if (Option.isNone(homeView)) {
        homeView = Option.some({ tool, camera, dismissed: dismissedMilestone })
      }
      redrawFactory('select')
      element('inspection-label').textContent = 'Inspecting ' + callsign + "'s factory"
      element('inspection-banner').hidden = false
    })
  },
})
element('inspection-back').onclick = () => {
  if (Option.isNone(homeView)) {
    return
  }
  inspection.leave()
  const { camera, tool: homeTool, dismissed } = homeView.value
  inspectionRequest++
  homeView = Option.none()
  redrawFactory(homeTool)
  dismissedMilestone = dismissed
  animateBoard(true)
  board.world.scale.set(camera.scale)
  board.world.position.set(camera.x, camera.y)
  element('inspection-banner').hidden = true
}
const loop = FixedLoop.start({
  source: BrowserTickSource.make(window),
  step,
  maxStepsPerFrame: 5,
  maxFrameSeconds: 0.25,
  update: (_, frame) => {
    if (!document.hidden && (!paused || inspection.visiting)) {
      const milestoneBefore = view.p.milestoneIndex
      for (let i = 0; i < (inspection.visiting ? 1 : speed); i++) {
        const result = runtime.tick(simulation, observe)
        if (!result.ok) {
          return result
        }
      }
      if (!frame.last) {
        return Result.success(undefined)
      }
      runtime.tick(draw)
      refresh()
      if (!inspection.visiting && view.p.milestoneIndex > milestoneBefore) {
        leaderboard.sync()
      }
    }
    return Result.success(undefined)
  },
  render: () => {
    if (document.hidden) {
      return
    }
    const cameraMoved = map.draw(view.p.boardTier)
    if (paused && !inspection.visiting && !boardChanged && !cameraMoved) {
      return
    }
    boardChanged = Option.isSome(reveal)
    const now = performance.now()
    perimeter.visible = Option.isSome(reveal)
    if (Option.isSome(reveal)) {
      const elapsed = now - reveal.value.start
      const camera = expansionCamera({ from: reveal.value.from, to: reveal.value.to, elapsed })
      board.world.scale.set(camera.scale)
      board.world.position.set(camera.x, camera.y)
      perimeter.scale.set(0.7 + 0.3 * Math.min(1, elapsed / 450))
      perimeter.alpha = 1 - Math.max(0, elapsed - 450) / 380
      if (elapsed >= 830) {
        reveal = Option.none()
      }
    }
    for (const node of board.buildings.children) {
      const t = (now - node.mounted) / 140
      const intake = (now - lastIntake) / 230
      if (node.visible && node.state.kind === 'hub' && intake < 1) {
        const pulse = Math.sin(Math.PI * intake) * (1 - intake)
        boardChanged = true
        node.scale.set(1 + pulse * 0.12)
      } else if (t < 1) {
        boardChanged = true
        node.scale.set(
          t < 0.68 ? 0.78 + 0.27 * Math.sin(((t / 0.68) * Math.PI) / 2) : 1.05 - (0.05 * (t - 0.68)) / 0.32
        )
      } else if (node.scale.x !== 1) {
        node.scale.set(1)
      }
    }
    for (let i = board.fx.children.length - 1; i >= 0; i--) {
      boardChanged = true
      const node = board.fx.getChildAt(i)

      const t = Math.min(1, (now - node.born) / node.duration)
      node.position.x += node.dx * (node.alpha - (1 - t))
      node.position.y += node.dy * (node.alpha - (1 - t))
      node.scale.set(node.ring ? 0.6 + t * 1.4 : 1 - t * 0.45)
      node.alpha = 1 - t
      if (t === 1) {
        node.destroy({ children: true })
      }
    }
    positionGuide()
    app.render()
  },
  onFailure: (error) => {
    throw new Error(Cause.pretty(Cause.die(error)))
  },
})
if (!loop.ok) {
  throw new Error('Could not start factory clock')
}

const restoredMessage = await resumed
if (restoredMessage !== undefined) {
  history.clear()
  undoButton.toggleAttribute('disabled', true)
  runtime.tick(draw)
  refresh(true)
  if (restoredMessage === 'Loaded shared factory') {
    void save()
  }
  if (restoredMessage.length > 0) {
    notify(restoredMessage)
  }
}
