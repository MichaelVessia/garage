import {
  applyEdits,
  clockwise,
  columns,
  inBounds,
  enqueue,
  exportSave,
  key,
  milestoneFor,
  rows,
} from '@garage/beltworks-domain'
import type { Cell, Command } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as Str from 'effect/String'
import { Point } from 'pixi.js'

import type { createAudio } from './audio.ts'
import { draw } from './board.ts'
import { notify } from './effects.ts'
import type { createEffects } from './effects.ts'
import type { Factory } from './factory.ts'
import { area } from './factory.ts'
import type { createGuide } from './guide.ts'
import { element } from './hud.ts'
import { tile } from './machines.ts'
import { beltPath } from './path.ts'
import { pinchCamera } from './pinch.ts'
import type { createPreview } from './preview.ts'
import { pickToolForBuilding, placement, tools } from './tools.ts'
import type { Tool } from './tools.ts'
import type { createViewport } from './viewport.ts'
type Input = {
  factory: Factory
  overlay: ReturnType<typeof createPreview>
  viewport: ReturnType<typeof createViewport>
  guide: ReturnType<typeof createGuide>
  audio: ReturnType<typeof createAudio>
  effects: ReturnType<typeof createEffects>
  refresh: (edited: boolean) => void
  choose: (tool: Tool) => void
  edit: (command: Command) => void
  undo: () => void
  pause: () => void
}
export function bindInput({
  factory,
  overlay,
  viewport,
  guide,
  audio,
  effects,
  refresh,
  choose,
  edit,
  undo,
  pause,
}: Input) {
  const { board, app, state, machineAt, primaryTarget, tunnelAt, inspection, history, runtime, undoButton, field } =
    factory
  const { ghost, preview, measurement, rotateButton } = overlay
  const { center, map, cancelReveal } = viewport
  const { beltNote, chime } = audio
  const { observe } = effects
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
    const targets = Arr.map(milestoneFor(state.view.p).requirements, (r) => r.value)
    const values = Arr.dedupe([...targets, ...Arr.map(Rec.keys(state.view.p.vault), Number)])
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
    guide.animateBoard()
  }
  element('lens').onclick = toggleLens
  function starterExtractor(cell: Cell) {
    if (
      guide.current.step !== 'extract' ||
      key(cell) !== key(guide.current.vein) ||
      (state.tool !== 'extractor' && state.tool !== 'select' && state.tool !== 'belt')
    ) {
      return false
    }
    const next = guide.current.nextTool
    state.facing = 'E'
    edit({ type: 'placeBuilding', kind: 'extractor', ...cell, dir: state.facing })
    if (!effects.rejected) {
      choose(next)
      notify('Nice! Now drag belts right into the Hub')
    }
    return true
  }
  const canvas = app.canvas
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
    state.hovered = gx >= 0 && gy >= 0 && gx < columns && gy < rows ? Option.some({ gx, gy }) : Option.none()
    preview()
  }
  function minScale() {
    return Math.min(0.5, field.clientWidth / (columns * tile + 40), field.clientHeight / (rows * tile + 40))
  }
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      cancelReveal()
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
  canvas.oncontextmenu = (e) => e.preventDefault()
  function beginEdit(cell: Cell) {
    if (inspection.visiting) {
      return
    }
    filterForm.hidden = true
    if (starterExtractor(cell)) {
      return
    }
    if (state.tool === 'erase') {
      state.eraseStart = Option.some(cell)
      preview()
      return
    }
    const machine = machineAt(cell)
    if (state.tool === 'select') {
      state.selectedBeacon = machine?.state.kind === 'beacon' ? Option.some(cell) : Option.none()
      preview()
      if (machine?.state.kind === 'filter') {
        openFilter(cell, machine.state.targetValue)
        return
      }
      if (machine === undefined || machine.state.kind === 'hub' || Option.isSome(state.selectedBeacon)) {
        return
      }
    }
    recordBeltDrag = state.tool === 'belt' && (machine?.state.kind === 'belt' || machine?.state.kind === 'extractor')
    if (recordBeltDrag && machine !== undefined) {
      state.beltDrag = Option.some({ bounds: area({ start: cell, end: cell }), placed: 0 })
      state.brush = Option.some({ cell, dir: machine.facing })
      preview()
      return
    }
    const empty = state.view.index.buildings[key(cell)] === undefined
    edit(
      placement(state.tool === 'tunnel' ? tunnelAt(cell).kind : state.tool)({
        cell,
        dir: state.facing,
        targetValue: primaryTarget(),
      })
    )
    if (state.tool === 'belt' && empty && inBounds(cell, state.view.p.boardTier)) {
      state.beltDrag = Option.some({ bounds: area({ start: cell, end: cell }), placed: 1 })
      state.brush = Option.some({ cell, dir: state.facing })
      preview()
    }
  }
  function extendBelt(cell: Cell) {
    if (inspection.visiting || Option.isNone(state.brush)) {
      return
    }
    const path = beltPath({
      start: state.brush.value.cell,
      end: cell,
      facing: state.brush.value.dir,
      laneAt: (cell) => {
        const machine = machineAt(cell)
        if (machine?.state.kind === 'belt') {
          return machine.facing
        }
        return machine === undefined && inBounds(cell, state.view.p.boardTier) ? 'empty' : 'blocked'
      },
    })
    if (Option.isSome(state.beltDrag)) {
      const bounds = state.beltDrag.value.bounds
      bounds.minX = Math.min(bounds.minX, path.cell.gx)
      bounds.maxX = Math.max(bounds.maxX, path.cell.gx)
      bounds.minY = Math.min(bounds.minY, path.cell.gy)
      bounds.maxY = Math.max(bounds.maxY, path.cell.gy)
      const placed = Arr.filter(path.commands, (c) => c.type === 'placeBuilding').length
      for (let i = 0; i < placed; i++) {
        beltNote(state.beltDrag.value.placed + i, i * 0.025)
      }
      state.beltDrag.value.placed += placed
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
    state.brush = path.blocked ? Option.none() : Option.some({ cell: path.cell, dir: path.dir })
  }
  function clearStroke() {
    state.eraseStart = Option.none()
    state.beltDrag = Option.none()
    state.brush = Option.none()
    pan = Option.none()
    preview()
  }

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
    const stroke = Option.getOrUndefined(state.pendingStroke)
    if (stroke === undefined || stroke.tool !== state.tool) {
      return
    }
    const dx = point.x - stroke.start.x,
      dy = point.y - stroke.start.y
    stroke.moved ||= Math.hypot(dx, dy) > 6
    if (state.tool === 'select' && stroke.moved) {
      board.world.position.set(stroke.origin.x + dx, stroke.origin.y + dy)
    }
    hover(e)
    if (state.tool === 'belt' && Option.isSome(state.hovered)) {
      const last = stroke.route.at(-1)
      if (last === undefined || key(last) !== key(state.hovered.value)) {
        stroke.route.push(state.hovered.value)
      }
    }
  }

  canvas.onpointerdown = (e) => {
    if (e.pointerType !== 'touch' && (!e.isPrimary || MutableHashMap.size(touches) > 0)) {
      return
    }
    map.cancelPan()
    cancelReveal()
    canvas.setPointerCapture(e.pointerId)
    if (e.pointerType === 'touch') {
      const start = pointer(e)
      MutableHashMap.set(touches, e.pointerId, start)
      if (MutableHashMap.size(touches) > 1) {
        state.pendingStroke = Option.none()
        state.hovered = Option.none()
        clearStroke()
        return
      }
      hover(e)
      state.pendingStroke = Option.some({
        start,
        origin: board.world.position.clone(),
        cell: state.hovered,
        tool: state.tool,
        route: [],
        moved: false,
      })
      if (state.tool === 'erase') {
        state.eraseStart = state.hovered
      }
      preview()
      return
    }
    hover(e)
    if (e.button === 2 || e.button === 1 || (state.tool === 'select' && e.button === 0)) {
      pan = Option.some({ start: pointer(e), origin: board.world.position.clone(), moved: false })
    } else if (e.button === 0 && Option.isSome(state.hovered)) {
      beginEdit(state.hovered.value)
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
    if (Option.isSome(state.hovered)) {
      extendBelt(state.hovered.value)
    }
  }
  canvas.onpointerup = (e) => {
    if (e.pointerType === 'touch') {
      if (!MutableHashMap.has(touches, e.pointerId)) {
        return
      }
      moveTouch(e)
      MutableHashMap.remove(touches, e.pointerId)
      const completed = Option.getOrUndefined(state.pendingStroke)
      state.pendingStroke = Option.none()
      if (completed === undefined || completed.tool !== state.tool || (state.tool === 'select' && completed.moved)) {
        clearStroke()
        return
      }
      if (Option.isSome(completed.cell)) {
        if (Option.isSome(state.hovered) && ghost.visible && ghost.state.kind === 'combiner') {
          beginEdit(state.hovered.value)
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
      if (
        e.button === 0 &&
        state.tool === 'select' &&
        Option.isSome(pan) &&
        !pan.value.moved &&
        Option.isSome(state.hovered)
      ) {
        beginEdit(state.hovered.value)
      }
    }
    if (e.button === 0 && Option.isSome(state.eraseStart) && Option.isSome(state.hovered)) {
      edit({ type: 'removeArea', ...area({ start: state.eraseStart.value, end: state.hovered.value }) })
    }
    if (e.button === 2 && Option.isSome(pan) && !pan.value.moved && Option.isSome(state.hovered)) {
      edit({ ...state.hovered.value, type: 'removeBuilding' })
    }
    clearStroke()
  }
  canvas.onlostpointercapture = canvas.onpointercancel = (e) => {
    if (e.pointerType === 'touch') {
      if (!MutableHashMap.has(touches, e.pointerId)) {
        return
      }
      MutableHashMap.remove(touches, e.pointerId)
      state.pendingStroke = Option.none()
    }
    clearStroke()
  }

  canvas.onpointerleave = () => {
    state.hovered = Option.none()
    preview()
  }
  function rotateFacing() {
    state.facing = clockwise[state.facing]
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
    const hoveredState = Option.isSome(state.hovered) ? machineAt(state.hovered.value)?.state : undefined
    if (k === '?') {
      element('controls').togglePopover()
    } else if (k === 'v') {
      toggleLens()
    } else if (k === 'f' && Option.isSome(state.hovered) && hoveredState?.kind === 'filter') {
      openFilter(state.hovered.value, hoveredState.targetValue)
    } else if (k === ' ') {
      e.preventDefault()
      pause()
    } else if (k === 'q' && Option.isSome(state.hovered)) {
      const machine = machineAt(state.hovered.value)
      if (machine !== undefined) {
        const picked = pickToolForBuilding({ state: machine.state, milestoneIndex: state.view.p.milestoneIndex })
        if (Option.isSome(picked)) {
          state.facing = machine.facing
          choose(picked.value)
        }
      }
    } else if (k === 'h') {
      center()
    } else if (k === 'r') {
      if (state.tool === 'select' && Option.isSome(state.hovered)) {
        edit({ ...state.hovered.value, type: 'rotateBuilding' })
      } else {
        rotateFacing()
      }
      preview()
    } else {
      const t = Arr.findFirst(tools, (item) => Str.toLowerCase(item.key) === (k === 'escape' ? 'esc' : k))
      if (Option.isSome(t) && t.value.unlock <= state.view.p.milestoneIndex) {
        choose(t.value.id)
      }
    }
  })
  return { clearStroke }
}
