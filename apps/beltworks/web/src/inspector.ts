import {
  BUFFER_CAPACITY,
  productionSpeed,
  extractorPeriod,
  findTunnelPartner,
  key,
  milestoneFor,
  inBounds,
} from '@garage/beltworks-domain'
import type { Cell } from '@garage/beltworks-domain'
import type { initial } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { createBoard } from './board.ts'

export function inspectCell({
  cell,
  board,
  p,
  index,
}: {
  cell: Cell
  board: ReturnType<typeof createBoard>
  p: typeof initial
  index: { readonly buildings: Readonly<Record<string, number>>; readonly veins: Readonly<Record<string, number>> }
}) {
  if (!inBounds(cell, p.boardTier)) {
    return ''
  }
  const id = index.buildings[key(cell)],
    vein = index.veins[key(cell)]
  const value = vein === undefined ? undefined : board.ore.get(vein)?.label
  const node = id === undefined ? undefined : board.machines.get(id)
  if (node === undefined) {
    return value === undefined ? '' : 'Vein ' + value + ' · Place Extractor'
  }
  const state = node.state
  switch (state.kind) {
    case 'hub': {
      const m = milestoneFor(p)
      return (
        'Central Hub · ' +
        Arr.join(
          Arr.map(m.requirements, ({ value, quota }) => `Target ${value} (${p.delivered[value] ?? 0} / ${quota})`),
          ' · '
        )
      )
    }
    case 'extractor':
      return (
        'Extractor · Mines ' +
        value +
        ' · ' +
        ((60 * productionSpeed(p)) / extractorPeriod(p.upgrades.extractorSpeed)).toFixed(1) +
        '/s'
      )
    case 'combiner': {
      const a = Option.getOrUndefined(state.slotA),
        b = Option.getOrUndefined(state.slotB)
      const result =
        a === undefined || b === undefined
          ? ''
          : ' → ' +
            Math.min(
              Number.MAX_SAFE_INTEGER,
              { add: a + b, sub: Math.max(0, a - b), div: b > 0 ? Math.floor(a / b) : 0, mul: a * b }[state.op]
            )
      return (
        { div: 'Divider (÷)', mul: 'Multiplier (×)', sub: 'Subtractor (−)', add: 'Adder (+)' }[state.op] +
        ' · A: ' +
        (a ?? '–') +
        ' · B: ' +
        (b ?? '–') +
        result
      )
    }
    case 'filter':
      return 'Filter · ' + state.targetValue + ' straight · Other values to the side'
    case 'beacon':
      return 'Beacon · ' + (state.fuelTicks > 0 ? Math.ceil(state.fuelTicks / 60) + ' s of fuel' : 'Needs fuel ≥ 2')
    case 'buffer':
      return (
        'Buffer Silo · ' +
        Option.match(state.storedValue, { onSome: (v) => 'Value ' + v, onNone: () => 'Empty' }) +
        ' · ' +
        state.count +
        '/' +
        BUFFER_CAPACITY
      )
    case 'splitter':
      return 'Splitter · Next output: ' + (state.nextPort === 0 ? 'Left' : 'Right')
    case 'tunnelIn':
    case 'tunnelOut': {
      const partner = findTunnelPartner({
        cell,
        source: state.kind,
        facing: node.facing,
        at: board.buildingAt(index.buildings),
      })
      return (
        (state.kind === 'tunnelIn' ? 'Tunnel Entry' : 'Tunnel Exit') +
        ' · ' +
        (partner === undefined
          ? 'Unlinked'
          : 'Linked (' + (Math.abs(partner.gx - cell.gx) + Math.abs(partner.gy - cell.gy)) + ' tiles)')
      )
    }
    case 'belt':
      return 'Belt · Facing ' + node.facing
    case 'trash':
      return 'Trash'
  }
}
