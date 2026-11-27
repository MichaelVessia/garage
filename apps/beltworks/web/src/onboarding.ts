import type { Cell, BuildingAt, initial } from '@garage/beltworks-domain'
import { columns } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

export type StarterGuide =
  | { step: 'extract'; vein: Cell; nextTool: 'belt' }
  | { step: 'connect'; cells: ReadonlyArray<Cell> }
  | { step: 'waiting' | 'flowing' | 'recipe' | 'hidden' }

export function starterGuide({
  p,
  vein,
  at,
  hasThree,
}: {
  p: typeof initial
  vein: Option.Option<Cell>
  at: BuildingAt
  hasThree: boolean
}): StarterGuide {
  if (p.milestoneIndex === 1 && !hasThree && (p.delivered[3] ?? 0) === 0) {
    return { step: 'recipe' }
  }
  if (p.milestoneIndex !== 0 || Option.isNone(vein)) {
    return { step: 'hidden' }
  }
  if ((p.delivered[1] ?? 0) > 0) {
    return { step: 'flowing' }
  }
  if (!Option.exists(at(vein.value), (machine) => machine.kind === 'extractor')) {
    return { step: 'extract', vein: vein.value, nextTool: 'belt' }
  }
  const cells: Array<Cell> = []
  for (let gx = vein.value.gx + 1; gx < columns / 2 - 1; gx++) {
    const cell = { gx, gy: vein.value.gy }
    if (!Option.exists(at(cell), (machine) => machine.kind === 'belt' && machine.dir === 'E')) {
      cells.push(cell)
    }
  }
  return cells.length > 0 ? { step: 'connect', cells } : { step: 'waiting' }
}
