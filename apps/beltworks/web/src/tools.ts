import { toolUnlock, findTunnelPartner } from '@garage/beltworks-domain'
import type { BuildingAt, BuildingState, Cell, Command, Direction } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

export const tools = [
  { id: 'select', name: 'Select', key: 'Esc', path: 'M4 3l5 16 3-6 6-3z', unlock: 0 },
  { id: 'belt', name: 'Belt', key: '1', path: 'M2 5h18v12H2z M6 8l3 3-3 3m6-6 3 3-3 3', unlock: toolUnlock.belt },
  {
    id: 'extractor',
    name: 'Extractor',
    key: '2',
    path: 'M5 4h12l3 5-4 10H6L2 9z M11 6l4 4-4 5-4-5z',
    unlock: toolUnlock.extractor,
  },
  { id: 'add', name: 'Adder', key: '3', path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M7 11h8m-4-4v8', unlock: toolUnlock.add },
  {
    id: 'splitter',
    name: 'Splitter',
    key: '4',
    path: 'M10 20v-6L4 8V3m8 17v-6l6-6V3M2 5l2-2 2 2m10 0 2-2 2 2',
    unlock: toolUnlock.splitter,
  },
  {
    id: 'trash',
    name: 'Trash',
    key: '5',
    path: 'M4 6h14M8 3h6M6 8l1 11h8l1-11M9 10v6m4-6v6',
    unlock: toolUnlock.trash,
  },
  {
    id: 'tunnel',
    name: 'Tunnel',
    key: 'T',
    path: 'M3 17V8l4-5h8l4 5v9M7 16v-5l2-3h4l2 3v5M11 12v8m-3-3 3 3 3-3',
    unlock: toolUnlock.tunnelIn,
  },
  { id: 'sub', name: 'Subtractor', key: '6', path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M7 11h8', unlock: toolUnlock.sub },
  {
    id: 'mul',
    name: 'Multiplier',
    key: '7',
    path: 'M5 3h12l3 3v11l-3 3H5l-3-3V6z M8 8l6 6m0-6-6 6',
    unlock: toolUnlock.mul,
  },
  { id: 'erase', name: 'Erase', key: 'X', path: 'M3 13l10-10 7 7-10 10H8z M7 9l7 7', unlock: 0 },
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
  ({ cell, dir }: { cell: Cell; dir: Direction }): Command => {
    switch (tool) {
      case 'select':
        return { ...cell, type: 'rotateBuilding' }
      case 'erase':
        return { ...cell, type: 'removeBuilding' }
      case 'add':
      case 'sub':
      case 'mul':
        return { ...cell, type: 'placeBuilding', kind: 'combiner', op: tool, dir }
      default:
        return { ...cell, type: 'placeBuilding', kind: tool, dir }
    }
  }
export function ghostState(tool: PlacementTool): Option.Option<BuildingState> {
  switch (tool) {
    case 'select':
    case 'erase':
      return Option.none()
    case 'extractor':
      return Option.some({ kind: tool, remainingTicks: 0 })
    case 'splitter':
      return Option.some({ kind: tool, nextPort: 0 })
    case 'add':
    case 'sub':
    case 'mul':
      return Option.some({ kind: 'combiner', op: tool, slotA: Option.none(), slotB: Option.none(), remainingTicks: 0 })
    default:
      return Option.some({ kind: tool })
  }
}
