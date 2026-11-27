import { applyEdits, enqueue, exportSave } from '@garage/beltworks-domain'
import type { Command } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { createAudio } from './audio.ts'
import { draw, stats } from './board.ts'
import { notify } from './effects.ts'
import type { createEffects } from './effects.ts'
import type { Factory } from './factory.ts'
import type { createGuide } from './guide.ts'
import { control, element, hud } from './hud.ts'
import type { createPreview } from './preview.ts'
import { tools } from './tools.ts'
import type { Tool } from './tools.ts'
import type { createViewport } from './viewport.ts'
export function createEditor({
  factory,
  overlay,
  guide,
  viewport,
  effects,
  audio,
  syncScore,
}: {
  factory: Factory
  overlay: ReturnType<typeof createPreview>
  guide: ReturnType<typeof createGuide>
  viewport: ReturnType<typeof createViewport>
  effects: ReturnType<typeof createEffects>
  audio: ReturnType<typeof createAudio>
  syncScore: () => void
}) {
  const { state, board, inspection, runtime, history, undoButton } = factory
  const { preview, inspectHover } = overlay
  const { animateBoard } = guide
  const { map, fitBoard, revealExpansion } = viewport
  const { celebrate, beltNote, chime } = audio
  const { observe } = effects
  let revision = 0
  let editedSinceStart = false
  function choose(t: Tool) {
    if (inspection.visiting && t !== 'select') {
      return
    }
    state.brush = Option.none()
    state.beltDrag = Option.none()
    state.selectedBeacon = Option.none()
    element('filter-picker').hidden = true
    state.eraseStart = Option.none()
    state.tool = t
    updateHud(state.view.p, t)
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
  function refresh(edited = false) {
    const previous = state.view
    state.view = runtime.inspect(stats)
    if (previous.p.milestoneIndex !== state.view.p.milestoneIndex || state.view.p.runTicks < previous.p.runTicks) {
      guide.dismissed = Option.none()
    }
    if (!edited && state.view.p.contractIndex > previous.p.contractIndex) {
      celebrate(392)
    }
    if (edited) {
      map.invalidate()
      editedSinceStart = true
      board.tracks(state.view)
    }
    if (
      edited ||
      previous.p.deliveryWindow !== state.view.p.deliveryWindow ||
      previous.p.meta !== state.view.p.meta ||
      Math.floor(previous.p.runTicks / 60) !== Math.floor(state.view.p.runTicks / 60)
    ) {
      updateHud(state.view.p, state.tool)
    }
    if (
      previous.p.boardTier !== state.view.p.boardTier ||
      (previous.p.milestoneIndex === 0) !== (state.view.p.milestoneIndex === 0)
    ) {
      fitBoard(state.view.p.boardTier > previous.p.boardTier)
    }
    if (
      previous.index.buildings !== state.view.index.buildings ||
      (previous.index !== state.view.index && Option.isSome(state.hovered))
    ) {
      preview()
    }
    animateBoard(
      edited ||
        previous.p.milestoneIndex !== state.view.p.milestoneIndex ||
        previous.p.craftedTargets !== state.view.p.craftedTargets ||
        ((previous.p.delivered[1] ?? 0) === 0) !== ((state.view.p.delivered[1] ?? 0) === 0)
    )
    if (Option.isSome(state.hovered)) {
      inspectHover()
    }
    revision++
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
    effects.resetRejection()
    enqueue(command)(runtime)
    runtime.tick(applyEdits, observe, draw)
    if (snapshot !== undefined && !effects.rejected) {
      history.record(snapshot)
    }
    refresh(true)
    if (!effects.rejected) {
      if (command.type === 'placeBuilding' && command.kind === 'belt') {
        beltNote(0)
      } else if (command.type === 'rotateBuilding' || command.type === 'placeBuilding') {
        chime(220, 0, 0.035, 'triangle')
      }
      if (command.type === 'placeBuilding' && command.kind === 'beacon') {
        notify('Belt any 2+ number into the Beacon to power its speed boost (higher numbers last longer)')
      }
      if (command.type === 'ascendBoard') {
        syncScore()
        history.clear()
        choose('extractor')
        celebrate()
      }
      if (command.type === 'expandBoard') {
        revealExpansion()
        notify('Workshop expanded · Ring ' + state.view.p.boardTier)
        celebrate(329.63)
      }
    }
    undoButton.toggleAttribute('disabled', !history.available)
  }
  function undo() {
    if (inspection.visiting || !history.undo()) {
      return
    }
    state.brush = Option.none()
    state.beltDrag = Option.none()
    state.eraseStart = Option.none()
    for (const node of board.fx.removeChildren()) {
      node.destroy({ children: true })
    }
    runtime.tick(draw)
    refresh(true)
    if (!Arr.some(tools, (t) => t.id === state.tool && t.unlock <= state.view.p.milestoneIndex)) {
      choose('extractor')
    }
    preview()
    undoButton.toggleAttribute('disabled', !history.available)
  }
  undoButton.onclick = undo

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
        control({ id, title })
        button.classList.remove('confirm')
        action()
        return
      }
      control({ id, title: confirm })
      button.classList.add('confirm')
      timer = window.setTimeout(() => {
        timer = 0
        control({ id, title })
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

  function showBoard() {
    board.tracks(state.view)
    animateBoard()
    updateHud(state.view.p, state.tool)
    viewport.center()
  }
  return {
    refresh,
    choose,
    edit,
    undo,
    showBoard,
    get revision() {
      return revision
    },
    get editedSinceStart() {
      return editedSinceStart
    },
  }
}
