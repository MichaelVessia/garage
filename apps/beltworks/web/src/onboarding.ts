import type { Cell, BuildingAt, CombinerOp, Direction, initial } from '@garage/beltworks-domain'
import { boardBounds, clockwise, columns, counterClockwise, neighbor, opposite, rows } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

export type StarterGuide =
  | { step: 'extract'; vein: Cell; nextTool: 'belt' }
  | { step: 'connect'; cells: ReadonlyArray<Cell> }
  | { step: 'mine-two'; vein: Cell }
  | { step: 'place-adder'; cell: Cell; a: ReadonlyArray<Cell>; b: ReadonlyArray<Cell> }
  | { step: 'back-belt'; cell: Cell }
  | { step: 'waiting' | 'flowing' | 'recipe' | 'hidden' }

export function combinerPorts({ cell, facing }: { cell: Cell; facing: Direction }) {
  return {
    a: neighbor(counterClockwise[facing])(cell),
    b: neighbor(clockwise[facing])(cell),
    output: neighbor(facing)(cell),
  }
}

// The starter veins flank the Hub. Route each extractor south, then turn toward the Adder.
function inputRibbon(source: Cell, port: Cell) {
  const cells = [source]
  for (let gy = source.gy + 1; gy <= port.gy; gy++) {
    cells.push({ gx: source.gx, gy })
  }
  const step = Math.sign(port.gx - source.gx)
  for (let gx = source.gx; gx !== port.gx;) {
    gx += step
    cells.push({ gx, gy: port.gy })
  }
  return cells
}

function suggestedAdder(one: Cell, two: Cell, at: BuildingAt): StarterGuide {
  const clear = (cell: Cell) => Option.match(at(cell), { onNone: () => true, onSome: (m) => m.kind === 'belt' })
  for (let gy = Math.max(one.gy, two.gy, rows / 2) + 1; gy <= boardBounds(0).maxY; gy++) {
    for (const gx of [columns / 2 - 1, columns / 2]) {
      const cell = { gx, gy }
      if (Option.isSome(at(cell))) {
        continue
      }
      const ports = combinerPorts({ cell, facing: 'N' })
      const a = inputRibbon(one, ports.a)
      const b = inputRibbon(two, ports.b)
      let output = ports.output
      while (output.gy > rows / 2 && clear(output)) {
        output = neighbor('N')(output)
      }
      if (
        Option.exists(at(output), (m) => m.kind === 'hub') &&
        Arr.every(a.slice(1), clear) &&
        Arr.every(b.slice(1), clear)
      ) {
        return { step: 'place-adder', cell, a, b }
      }
    }
  }
  return { step: 'recipe' }
}

export function starterGuide({
  p,
  vein,
  at,
  hasThree,
  two,
  combiners,
  dismissed,
}: {
  p: typeof initial
  vein: Option.Option<Cell>
  at: BuildingAt
  hasThree: boolean
  two: Option.Option<Cell>
  combiners: ReadonlyArray<Cell & { dir: Direction; op: CombinerOp }>
  dismissed: boolean
}): StarterGuide {
  if (dismissed) {
    return { step: 'hidden' }
  }
  if (p.milestoneIndex === 1) {
    if (p.craftedTargets.includes(3) || hasThree || (p.delivered[3] ?? 0) > 0) {
      return { step: 'hidden' }
    }
    for (const combiner of combiners) {
      const back = neighbor(opposite[combiner.dir])(combiner)
      if (Option.exists(at(back), (m) => m.kind === 'belt' && m.dir === combiner.dir)) {
        return { step: 'back-belt', cell: back }
      }
    }
    if (Option.isSome(two) && !Option.exists(at(two.value), (m) => m.kind === 'extractor')) {
      return { step: 'mine-two', vein: two.value }
    }
    return !Arr.some(combiners, (machine) => machine.op === 'add') &&
      Option.isSome(vein) &&
      Option.exists(at(vein.value), (m) => m.kind === 'extractor') &&
      Option.isSome(two)
      ? suggestedAdder(vein.value, two.value, at)
      : { step: 'recipe' }
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
