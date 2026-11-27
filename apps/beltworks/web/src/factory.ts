import { Game, initialResources, key, milestoneFor } from '@garage/beltworks-domain'
import type { Cell, Direction } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'
import type { Application, Point } from 'pixi.js'

import { draw, createBoard, stats } from './board.ts'
import type { BoardStats } from './board.ts'
import { cloud } from './cloud.ts'
import { editHistory } from './history.ts'
import { element } from './hud.ts'
import { factoryInspection } from './inspection.ts'
import { loadBoard } from './storage.ts'
import { tunnelPreview } from './tools.ts'
import type { Tool } from './tools.ts'

type TouchStroke = {
  start: Point
  origin: Point
  cell: Option.Option<Cell>
  tool: Tool
  route: Array<Cell>
  moved: boolean
}
export function area({ start, end }: { start: Cell; end: Cell }) {
  return {
    minX: Math.min(start.gx, end.gx),
    maxX: Math.max(start.gx, end.gx),
    minY: Math.min(start.gy, end.gy),
    maxY: Math.max(start.gy, end.gy),
  }
}

type Board = ReturnType<typeof createBoard>
const storage = () => window.localStorage

export function createFactory({ app, field }: { app: Application; field: HTMLElement }): Factory {
  const board: Board = createBoard()
  app.stage.addChild(board.world)
  const runtime = boardRuntime(board.services)
  const history = editHistory(runtime)
  const undoButton = element('undo')
  const localRevision = loadBoard(storage)(runtime)
  const inspection = factoryInspection(runtime)
  const sync = cloud({ runtime, getSave: inspection.getSave })
  runtime.tick(draw)
  const state = editorState(runtime.inspect(stats))
  function machineAt(cell: Cell) {
    const id = state.view.index.buildings[key(cell)]
    return id === undefined ? undefined : board.machines.get(id)
  }
  function primaryTarget() {
    return milestoneFor(state.view.p).requirements[0]?.value ?? 1
  }
  const tunnelAt = (cell: Cell) =>
    tunnelPreview({ cell, facing: state.facing, at: board.buildingAt(state.view.index.buildings) })
  return {
    app,
    board,
    field,
    runtime,
    history,
    undoButton,
    inspection,
    sync,
    storage,
    localRevision,
    state,
    machineAt,
    primaryTarget,
    tunnelAt,
  }
}

type BoardServices = ReturnType<typeof createBoard>['services']
type RuntimeResult = ReturnType<typeof Game.Runtime.make<BoardServices, ReturnType<typeof initialResources>>>
function boardRuntime(services: BoardServices): Extract<RuntimeResult, { ok: true }>['value'] {
  const made = Game.Runtime.make({ services, resources: initialResources() })
  if (!made.ok) {
    throw new Error('Invalid initial factory')
  }
  return made.value
}
function editorState(view: BoardStats, tool: Tool = 'extractor', facing: Direction = 'E') {
  return {
    view,
    boardChanged: true,
    tool,
    facing,
    hovered: Option.none<Cell>(),
    selectedBeacon: Option.none<Cell>(),
    eraseStart: Option.none<Cell>(),
    beltDrag: Option.none<{ bounds: ReturnType<typeof area>; placed: number }>(),
    brush: Option.none<{ cell: Cell; dir: Direction }>(),
    pendingStroke: Option.none<TouchStroke>(),
  }
}
export interface Factory {
  app: Application
  board: Board
  field: HTMLElement
  runtime: ReturnType<typeof boardRuntime>
  history: ReturnType<typeof editHistory>
  undoButton: HTMLElement
  inspection: ReturnType<typeof factoryInspection>
  sync: ReturnType<typeof cloud>
  storage: () => Storage
  localRevision: ReturnType<ReturnType<typeof loadBoard>>
  state: ReturnType<typeof editorState>
  machineAt: (cell: Cell) => ReturnType<Board['machines']['get']>
  primaryTarget: () => number
  tunnelAt: (cell: Cell) => ReturnType<typeof tunnelPreview>
}
