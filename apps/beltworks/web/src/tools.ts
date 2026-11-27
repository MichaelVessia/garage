import {
  clockwise,
  counterClockwise,
  neighbor,
  opposite,
  toolUnlock,
  findTunnelPartner,
} from '@garage/beltworks-domain'
import type { BuildingAt, BuildingState, Cell, Command, Direction } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

export const tools = [
  { id: 'select', name: 'Select', key: 'Esc', path: 'M4 3l5 16 3-6 6-3z', unlock: 0 },
  { id: 'erase', name: 'Erase', key: 'X', path: 'M3 13l10-10 7 7-10 10H8z M7 9l7 7', unlock: 0 },
  { id: 'belt', name: 'Belt', key: '1', path: 'M2 5h18v12H2z M6 8l3 3-3 3m6-6 3 3-3 3', unlock: toolUnlock.belt },
  {
    id: 'extractor',
    name: 'Extractor',
    key: '2',
    path: 'M5 4h12l3 5-4 10H6L2 9z M11 6l4 4-4 5-4-5z',
    unlock: toolUnlock.extractor,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    key: '4',
    path: 'M10 20v-6L4 8V3m8 17v-6l6-6V3M2 5l2-2 2 2m10 0 2-2 2 2',
    unlock: toolUnlock.splitter,
  },
  {
    id: 'tunnel',
    name: 'Tunnel',
    key: 'T',
    path: 'M3 17V8l4-5h8l4 5v9M7 16v-5l2-3h4l2 3v5M11 12v8m-3-3 3 3 3-3',
    unlock: toolUnlock.tunnelIn,
  },
  {
    id: 'buffer',
    name: 'Buffer Silo',
    key: 'S',
    path: 'M4 6a7 3 0 1 0 14 0 7 3 0 1 0-14 0v11a7 3 0 0 0 14 0V6M14 11v5m-2-1h2',
    unlock: toolUnlock.buffer,
  },
  {
    id: 'filter',
    name: 'Filter',
    key: 'F',
    path: 'M3 4h16v9l-6 5H9l-6-5z M11 15V6m-3 3 3-3 3 3m-3 4h6',
    unlock: toolUnlock.filter,
  },
  {
    id: 'trash',
    name: 'Trash',
    key: '5',
    path: 'M4 6h14M8 3h6M6 8l1 11h8l1-11M9 10v6m4-6v6',
    unlock: toolUnlock.trash,
  },
  { id: 'add', name: 'Adder', key: '3', path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M7 11h8m-4-4v8', unlock: toolUnlock.add },
  { id: 'sub', name: 'Subtractor', key: '6', path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M7 11h8', unlock: toolUnlock.sub },
  {
    id: 'mul',
    name: 'Multiplier',
    key: '7',
    path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M8 8l6 6m0-6-6 6',
    unlock: toolUnlock.mul,
  },
  {
    id: 'div',
    name: 'Divider',
    key: '8',
    path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M6 11h10m-5-5v2m0 6v2',
    unlock: toolUnlock.div,
  },
  {
    id: 'beacon',
    name: 'Beacon',
    title: 'Overclock Beacon (K) · Belt any 2+ number into it for +50% speed in a 5×5 aura',
    key: 'K',
    path: 'M4 19h14M8 17l3-13 3 13M5 8q6 4 12 0M3 5q8 5 16 0',
    unlock: toolUnlock.beacon,
  },
] as const
export type Tool = (typeof tools)[number]['id']
export function pickToolForBuilding({
  state,
  milestoneIndex,
}: {
  state: BuildingState
  milestoneIndex: number
}): Option.Option<Tool> {
  const kind = state.kind
  if (kind === 'hub') {
    return Option.none()
  }
  const id = kind === 'combiner' ? state.op : kind
  if (toolUnlock[id] > milestoneIndex) {
    return Option.none()
  }
  return Option.some(id === 'tunnelIn' || id === 'tunnelOut' ? 'tunnel' : id)
}
export function tunnelPreview({ cell, facing, at }: { cell: Cell; facing: Direction; at: BuildingAt }) {
  const behind = findTunnelPartner({ cell, facing, at, source: 'tunnelOut' })
  if (behind !== undefined && findTunnelPartner({ cell: behind, facing, at }) === undefined) {
    return { kind: 'tunnelOut', partner: behind } as const
  }
  const ahead = findTunnelPartner({ cell, facing, at })
  const partner =
    ahead !== undefined && findTunnelPartner({ cell: ahead, facing, at, source: 'tunnelOut' }) === undefined
      ? ahead
      : undefined
  return { kind: 'tunnelIn', partner } as const
}
type PlacementTool = Exclude<Tool, 'tunnel'> | 'tunnelIn' | 'tunnelOut'
export const placement =
  (tool: PlacementTool) =>
  ({ cell, dir, targetValue = 1 }: { cell: Cell; dir: Direction; targetValue?: number }): Command => {
    switch (tool) {
      case 'select':
        return { ...cell, type: 'rotateBuilding' }
      case 'erase':
        return { ...cell, type: 'removeBuilding' }
      case 'filter':
        return { ...cell, type: 'placeBuilding', kind: tool, targetValue, dir }
      case 'div':
      case 'add':
      case 'sub':
      case 'mul':
        return { ...cell, type: 'placeBuilding', kind: 'combiner', op: tool, dir }
      default:
        return { ...cell, type: 'placeBuilding', kind: tool, dir }
    }
  }
export function ghostState({
  tool,
  targetValue = 1,
}: {
  tool: PlacementTool
  targetValue?: number
}): Option.Option<BuildingState> {
  switch (tool) {
    case 'select':
    case 'erase':
      return Option.none()
    case 'filter':
      return Option.some({ kind: tool, targetValue })
    case 'beacon':
      return Option.some({ kind: tool, fuelTicks: 0 })
    case 'extractor':
      return Option.some({ kind: tool, remainingTicks: 0, surgeCount: 0, bonusPending: false })
    case 'buffer':
      return Option.some({ kind: tool, count: 0, storedValue: Option.none<number>() })
    case 'splitter':
      return Option.some({ kind: tool, nextPort: 0 })
    case 'add':
    case 'sub':
    case 'div':
    case 'mul':
      return Option.some({ kind: 'combiner', op: tool, slotA: Option.none(), slotB: Option.none(), remainingTicks: 0 })
    default:
      return Option.some({ kind: tool })
  }
}

export const portColors = { a: 0x68_e4_f4, b: 0xf6_c0_75, output: 0x66_f0_d8 }
export function machinePorts({ state, cell, facing }: { state: BuildingState; cell: Cell; facing: Direction }) {
  const left = counterClockwise[facing]
  const right = clockwise[facing]
  const back = opposite[facing]
  const port = (side: Direction, flow: Direction, color: number, prefix = '', suffix = '') => ({
    cell: neighbor(side)(cell),
    color,
    text: prefix + { N: '↑', E: '→', S: '↓', W: '←' }[flow] + suffix,
  })
  const { a, b: amber, output: mint } = portColors
  const input = 0xa7_bd_c5
  switch (state.kind) {
    case 'combiner':
      return [port(left, right, a, 'A '), port(right, left, amber, '', ' B'), port(facing, facing, amber)]
    case 'splitter':
      return [port(back, facing, input), port(left, left, mint), port(right, right, amber)]
    case 'filter':
      return [
        port(back, facing, input),
        port(facing, facing, mint, '=' + state.targetValue + ' '),
        port(right, right, amber, '≠ '),
      ]
    case 'tunnelIn':
      return [port(back, facing, input)]
    case 'tunnelOut':
    case 'buffer':
    case 'extractor':
      return [port(facing, facing, mint)]
    default:
      return []
  }
}
