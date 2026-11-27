import { clockwise, neighbor } from '@garage/beltworks-domain'
import type { Cell, Command, Direction } from '@garage/beltworks-domain'

// Fill skipped pointer cells with cardinal steps, following the longest axis first.
export function beltPath({
  start,
  end,
  facing,
  laneAt,
}: {
  start: Cell
  end: Cell
  facing: Direction
  laneAt: (cell: Cell) => Direction | 'blocked' | 'empty'
}) {
  const commands: Array<Command> = []
  let dir = facing
  let from = start
  while (from.gx !== end.gx || from.gy !== end.gy) {
    const dx = end.gx - from.gx
    const dy = end.gy - from.gy
    const travel = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N'
    while (dir !== travel) {
      commands.push({ ...from, type: 'rotateBuilding' })
      dir = clockwise[dir]
    }
    const to = neighbor(dir)(from)
    const existing = laneAt(to)
    if (existing === 'blocked') {
      return { commands, cell: from, dir, blocked: true }
    }
    if (existing === 'empty') {
      commands.push({ ...to, dir, type: 'placeBuilding', kind: 'belt' })
    } else {
      for (let orientation = existing; orientation !== travel; orientation = clockwise[orientation]) {
        commands.push({ ...to, type: 'rotateBuilding' })
      }
    }
    from = to
  }
  return { commands, cell: from, dir, blocked: false }
}
