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
  rows,
  simulation,
  step,
} from '@garage/beltworks-domain'
import type { Cell, Command, Direction } from '@garage/beltworks-domain'
import { FixedLoop, Result } from '@typeonce/ritmo'
import { BrowserTickSource } from '@typeonce/ritmo-browser'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'
import { Application, Graphics, Point } from 'pixi.js'

import { Burst, draw, createBoard, stats } from './board.ts'
import { cloud } from './cloud.ts'
import { editHistory } from './history.ts'
import { element, hud } from './hud.ts'
import { inspectCell } from './inspector.ts'
import { Machine, tile, oreColor } from './machines.ts'
import { medalInfo } from './medals.ts'
import { minimap } from './minimap.ts'
import { beltPath } from './path.ts'
import { loadBoard, saveBoard } from './storage.ts'
import { ghostState, pickToolForBuilding, placement, tools, tunnelPreview } from './tools.ts'
import type { Tool } from './tools.ts'

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
const sync = cloud(runtime)
let editedSinceStart = false
runtime.tick(draw)
let view = runtime.inspect(stats)
let tool: Tool = 'extractor'
let facing: Direction = 'E'
let hovered = Option.none<Cell>()
const ghost = board.preview.addChild(new Machine())
const border = board.preview.addChild(new Graphics())
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
function inspectHover() {
  const info = Option.isSome(hovered) ? inspectCell({ cell: hovered.value, board, p: view.p, index: view.index }) : ''
  if (inspector.textContent !== info) {
    inspector.textContent = info
  }
}
function preview() {
  inspectHover()
  board.setBeaconFocus(Option.getOrUndefined(hovered), Option.getOrUndefined(selectedBeacon))
  const direction = element('direction')
  direction.hidden = tool === 'select' || tool === 'erase' || tool === 'trash' || tool === 'beacon'
  direction.textContent = 'Facing ' + facing + ' · R to rotate'
  ghost.visible = false
  border.clear()
  measurement.hidden = true
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
  }
}
function choose(t: Tool) {
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
let sound = false
element('sound').onclick = () => {
  sound = !sound
  if (sound) {
    const context = Option.getOrElse(audio, () => new AudioContext())
    audio = Option.some(context)
    void context.resume()
  }
  control(
    'sound',
    sound ? 'Sound on' : 'Sound off',
    sound ? 'M3 9h4l5-4v12l-5-4H3z M15 8q4 3 0 6m2-9q7 6 0 12' : 'M3 9h4l5-4v12l-5-4H3z M15 9l4 4m0-4-4 4'
  )
  element('sound').setAttribute('aria-pressed', String(sound))
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
function celebrate() {
  chime(440)
  chime(554.37, 0.09)
  chime(659.25, 0.18, 0.32)
}
function burst(x: number, y: number, count: number, color: number, ripple: boolean) {
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count + (performance.now() % 1000) / 1000
    const spark = new Burst(Math.cos(angle) * 32, Math.sin(angle) * 32, false)
    spark.circle(0, 0, 3.7).setFillStyle({ color, alpha: 0.16 }).fill().poly([0, -3, 1.8, 0, 0, 3, -1.8, 0]).fill(color)
    spark.rotation = angle
    board.fx.addChild(spark).position.set(x, y)
  }
  if (ripple) {
    const ring = new Burst(0, 0, true)
    ring.circle(0, 0, 22).stroke({ color, width: 2 })
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
        if (delivery.matchedTarget) {
          burst((columns / 2) * tile, (rows / 2) * tile, 8, 0xff_d2_85, true)
          chime([440, 494, 554.37, 659.25, 739.99][delivery.value % 5] ?? 440)
        }
      }
      for (const craft of events.craft.all()) {
        burst((craft.gx + 0.5) * tile, (craft.gy + 0.5) * tile, 4, oreColor(craft.result), false)
      }
      const messages: Array<string> = []
      for (const event of events.complete.all()) {
        const reward = milestone(event.milestoneIndex).reward
        messages.push(
          'Milestone ' + (event.milestoneIndex + 1) + ' Complete' + (reward.length > 0 ? ' · Unlocked ' + reward : '')
        )
      }
      const medals = events.medal.all()
      if (medals.length > 0) {
        messages.push(
          'Medal · ' +
            Arr.join(
              Arr.map(medals, (event) => medalInfo[event.medal][0]),
              ' + '
            )
        )
        chime(523.25)
        chime(659.25, 0.06)
        chime(783.99, 0.12, 0.45)
      } else if (messages.length > 0) {
        celebrate()
      }
      if (messages.length > 0) {
        notify(Arr.join(messages, ' · '))
      }
      for (const event of events.reject.all()) {
        rejected = true
        notify(event.reason)
      }
    }
  )
)
let dirty = false
const hint = element('starter-hint')
function animateBoard() {
  const guide = view.p.milestoneIndex === 0 && view.p.totalDelivered === 0 && board.items.children.length === 0
  const empty = guide && Arr.every(board.buildings.children, (node) => node.state.kind === 'hub')
  const message = empty
    ? 'Start here: click vein 1 to place an Extractor, then press 1 and drag belts to the Hub'
    : guide
      ? 'Now press 1 (Belt) and drag east to the Hub'
      : ''
  if (hint.textContent !== message) {
    hint.textContent = message
  }
  board.animate(view.tick, view.p, empty)
}
function refresh(edited = false) {
  const previous = view
  view = runtime.inspect(stats)
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
    center()
  }
  if (previous.index !== view.index) {
    preview()
  }
  animateBoard()
  inspectHover()
  dirty = true
}
function edit(command: Command) {
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
    if (command.type === 'rotateBuilding' || command.type === 'placeBuilding') {
      chime(220, 0, 0.035, 'triangle')
    }
    if (command.type === 'ascendBoard') {
      history.clear()
      choose('extractor')
      celebrate()
    }
    if (command.type === 'expandBoard') {
      notify('Workshop expanded · Ring ' + view.p.boardTier)
      celebrate()
    }
  }
  undoButton.toggleAttribute('disabled', !history.available)
}
function save(keepalive = false) {
  if (dirty) {
    const revision = Math.floor(performance.timeOrigin + performance.now())
    sync.upload(revision, keepalive)
    if (saveBoard(storage)(runtime, revision)) {
      dirty = false
    } else {
      notify('Local save unavailable')
    }
  }
}
let paused = false,
  speed = 1
function pause() {
  paused = !paused
  control('pause', paused ? 'Play' : 'Pause', paused ? 'M6 3l12 8-12 8z' : 'M7 5v12m8-12v12')
}
element('pause').onclick = pause
element('speed').onclick = () => {
  speed = speed === 4 ? 1 : speed * 2
  control('speed', speed + '×')
  element('speed').classList.toggle('active', speed > 1)
}
function confirmAction(id: string, title: string, confirm: string, action: () => void) {
  const button = element(id)
  let timer = 0
  button.onclick = () => {
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
confirmAction('reset', 'Reset', 'Confirm reset', () => {
  history.clear()
  edit({ type: 'resetBoard' })
  choose('extractor')
})
confirmAction('clear', 'Clear floor', 'Confirm clear', () => edit({ type: 'clearFloor' }))
function undo() {
  if (!history.undo()) {
    return
  }
  brush = Option.none()
  beltDrag = Option.none()
  eraseStart = Option.none()
  for (const node of board.fx.removeChildren()) {
    node.destroy()
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
  const drawer = element('workshop')
  const top = element('bar').getBoundingClientRect().bottom + 12
  document.documentElement.style.setProperty('--drawer-top', Math.max(74, top) + 'px')
  const right =
    field.clientWidth > 900 && !drawer.hasAttribute('hidden') && drawer.hasAttribute('open')
      ? drawer.getBoundingClientRect().left - 12
      : field.clientWidth
  const w = Math.max(1, right),
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
function center() {
  map.cancelPan()
  viewport = boardViewport()
  map.invalidate()
  const { width: w, height: h, top } = viewport
  element('minimap').style.right = field.clientWidth - w + 8 + 'px'
  positionMinimap()
  const { minX, maxX, minY, maxY } = boardBounds(view.p.boardTier)
  const scale = Math.min(w / ((maxX - minX + 1) * tile + 40), h / ((maxY - minY + 1) * tile + 40))
  board.world.scale.set(scale)
  board.world.position.set((w - columns * tile * scale) / 2, top + (h - rows * tile * scale) / 2)
  map.draw(view.p.boardTier)
  hovered = Option.none()
  preview()
}
if (window.matchMedia('(max-width:850px)').matches) {
  document.querySelector('details')?.removeAttribute('open')
}
element('workshop').addEventListener('toggle', center)
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
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    map.cancelPan()
    const p = pointer(e),
      local = board.world.toLocal(p)
    const min = Math.min(0.5, field.clientWidth / (columns * tile + 40), field.clientHeight / (rows * tile + 40))
    const scale = Math.min(2.5, Math.max(min, board.world.scale.x * Math.exp(-e.deltaY * 0.0015)))
    board.world.scale.set(scale)
    board.world.position.set(p.x - local.x * scale, p.y - local.y * scale)
    hover(e)
  },
  { passive: false }
)
let pan = Option.none<{ start: Point; origin: Point; moved: boolean }>()
let existingBeltStart = false
function machineAt(cell: Cell) {
  const id = view.index.buildings[key(cell)]
  return id === undefined ? undefined : board.machines.get(id)
}
let brush = Option.none<{ cell: Cell; dir: Direction }>()
canvas.oncontextmenu = (e) => e.preventDefault()
canvas.onpointerdown = (e) => {
  if (!e.isPrimary) {
    return
  }
  map.cancelPan()
  hover(e)
  canvas.setPointerCapture(e.pointerId)
  if (e.button === 2 || e.button === 1) {
    pan = Option.some({ start: pointer(e), origin: board.world.position.clone(), moved: false })
  } else if (e.button === 0 && Option.isSome(hovered)) {
    filterForm.hidden = true
    if (tool === 'erase') {
      eraseStart = hovered
      preview()
      return
    }
    const machine = machineAt(hovered.value)
    if (tool === 'select') {
      selectedBeacon = machine?.state.kind === 'beacon' ? hovered : Option.none()
      preview()
      if (machine?.state.kind === 'filter') {
        openFilter(hovered.value, machine.state.targetValue)
        return
      }
      if (Option.isSome(selectedBeacon)) {
        return
      }
    }
    existingBeltStart = tool === 'belt' && machine?.state.kind === 'belt'
    if (existingBeltStart && machine !== undefined) {
      beltDrag = Option.some({ bounds: area({ start: hovered.value, end: hovered.value }), placed: 0 })
      brush = Option.some({ cell: hovered.value, dir: machine.facing })
      preview()
      return
    }
    const empty = view.index.buildings[key(hovered.value)] === undefined
    edit(
      placement(tool === 'tunnel' ? tunnelAt(hovered.value).kind : tool)({
        cell: hovered.value,
        dir: facing,
        targetValue: primaryTarget(),
      })
    )
    if (tool === 'belt' && empty && inBounds(hovered.value, view.p.boardTier)) {
      beltDrag = Option.some({ bounds: area({ start: hovered.value, end: hovered.value }), placed: 1 })
      brush = Option.some({ cell: hovered.value, dir: facing })
      preview()
    }
  }
}
canvas.onpointermove = (e) => {
  if (!e.isPrimary) {
    return
  }
  if (Option.isSome(pan)) {
    const p = pointer(e),
      dx = p.x - pan.value.start.x,
      dy = p.y - pan.value.start.y
    pan.value.moved ||= Math.hypot(dx, dy) > 4
    if (pan.value.moved) {
      board.world.position.set(pan.value.origin.x + dx, pan.value.origin.y + dy)
    }
  }
  hover(e)
  if (Option.isNone(brush) || Option.isNone(hovered)) {
    return
  }
  const path = beltPath({
    start: brush.value.cell,
    end: hovered.value,
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
    beltDrag.value.placed += Arr.filter(path.commands, (c) => c.type === 'placeBuilding').length
    preview()
  }
  if (path.commands.length > 0) {
    if (existingBeltStart) {
      history.record(exportSave(runtime))
      undoButton.removeAttribute('disabled')
      existingBeltStart = false
    }
    for (const command of path.commands) {
      enqueue(command)(runtime)
    }
    runtime.tick(applyEdits, observe, draw)
    refresh(true)
  }
  brush = path.blocked ? Option.none() : Option.some({ cell: path.cell, dir: path.dir })
}
canvas.onpointerup = (e) => {
  if (!e.isPrimary) {
    return
  }
  hover(e)
  if (e.button === 0 && Option.isSome(eraseStart) && Option.isSome(hovered)) {
    edit({ type: 'removeArea', ...area({ start: eraseStart.value, end: hovered.value }) })
  }
  eraseStart = Option.none()
  beltDrag = Option.none()
  preview()
  if (e.button === 2 && Option.isSome(pan) && !pan.value.moved && Option.isSome(hovered)) {
    edit({ ...hovered.value, type: 'removeBuilding' })
  }
  brush = Option.none()
  pan = Option.none()
}
canvas.onlostpointercapture = () => {
  eraseStart = Option.none()
  beltDrag = Option.none()
  preview()
  pan = Option.none()
  brush = Option.none()
}
canvas.onpointerleave = () => {
  hovered = Option.none()
  preview()
}
window.addEventListener('keydown', (e) => {
  const k = Str.toLowerCase(e.key)
  if (k === 'escape' && document.querySelector('#roadmap:popover-open') !== null) {
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
  if (k === 'v') {
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
      facing = clockwise[facing]
      chime(220, 0, 0.035, 'triangle')
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
window.setInterval(save, 5000)
window.addEventListener('pagehide', () => save(true))
element('share').onclick = () => {
  void sync
    .shareLink()
    .then(notify)
    .catch(() => notify('Could not share factory'))
}
const loop = FixedLoop.start({
  source: BrowserTickSource.make(window),
  step,
  maxStepsPerFrame: 5,
  maxFrameSeconds: 0.25,
  update: () => {
    if (!paused) {
      for (let i = 0; i < speed; i++) {
        const result = runtime.tick(simulation, observe)
        if (!result.ok) {
          return result
        }
      }
      runtime.tick(draw)
      refresh()
    }
    return Result.success(undefined)
  },
  render: () => {
    const now = performance.now()
    for (const node of board.buildings.children) {
      const t = (now - node.mounted) / 140
      if (t < 1) {
        node.scale.set(
          t < 0.68 ? 0.78 + 0.27 * Math.sin(((t / 0.68) * Math.PI) / 2) : 1.05 - (0.05 * (t - 0.68)) / 0.32
        )
      } else if (node.scale.x !== 1) {
        node.scale.set(1)
      }
    }
    for (let i = board.fx.children.length - 1; i >= 0; i--) {
      const node = board.fx.getChildAt(i)

      const t = Math.min(1, (now - node.born) / 420)
      node.position.x += node.dx * (node.alpha - (1 - t))
      node.position.y += node.dy * (node.alpha - (1 - t))
      node.scale.set(node.ring ? 0.6 + t * 1.4 : 1 - t * 0.45)
      node.alpha = 1 - t
      if (t === 1) {
        node.destroy()
      }
    }
    map.draw(view.p.boardTier)
    app.render()
  },
  onFailure: (error) => {
    throw new Error(Cause.pretty(Cause.die(error)))
  },
})
if (!loop.ok) {
  throw new Error('Could not start factory clock')
}

const restoredMessage = await sync.load(() => !editedSinceStart, localRevision).catch(() => undefined)
if (restoredMessage !== undefined) {
  history.clear()
  undoButton.toggleAttribute('disabled', true)
  runtime.tick(draw)
  refresh(true)
  if (restoredMessage === 'Loaded shared factory') {
    save()
  }
  if (restoredMessage.length > 0) {
    notify(restoredMessage)
  }
}
