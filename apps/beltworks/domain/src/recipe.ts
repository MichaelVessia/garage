import * as Fn from 'effect/Function'

import type { CombinerOp } from './model.ts'

function combine(op: CombinerOp, a: number, b: number): number {
  switch (op) {
    case 'add':
      return a + b
    case 'sub':
      return a - b
    case 'mul':
      return a * b
    case 'div':
      return a / b
  }
}
const signs = { add: '+', sub: '−', mul: '×', div: '÷' } as const

/** Search by number of combiners, so the first solution has the fewest machines. */
export const suggestRecipe: {
  (target: number, availableVeins: ReadonlyArray<number>, unlockedOps: ReadonlyArray<CombinerOp>): ReadonlyArray<string>
  (
    availableVeins: ReadonlyArray<number>,
    unlockedOps: ReadonlyArray<CombinerOp>
  ): (target: number) => ReadonlyArray<string>
} = Fn.dual(3, (target: number, availableVeins: ReadonlyArray<number>, unlockedOps: ReadonlyArray<CombinerOp>) => {
  const seen = new Uint8Array(2049)
  const leaves = new Array<readonly [number, string]>()
  for (const value of availableVeins) {
    if (value > 0 && seen[value] !== 1) {
      leaves.push([value, String(value)])
      seen[value] = 1
    }
  }
  if (seen[target] === 1) {
    return ['Extract ' + target + ' directly']
  }
  const layers = [leaves]
  // Keep hints small enough to read in the mission card.
  const limit = Math.min(2048, 2 * Math.max(target, ...availableVeins))
  for (let cost = 1; cost <= 10; cost++) {
    const next = new Array<readonly [number, string]>()
    for (const [i, left] of layers.entries()) {
      const right = layers[cost - 1 - i]
      if (right === undefined) {
        continue
      }
      for (const [a, first] of left) {
        for (const [b, second] of right) {
          for (const op of unlockedOps) {
            const value = combine(op, a, b)
            if (!Number.isInteger(value) || value <= 0 || value > limit || seen[value] === 1) {
              continue
            }
            const expr = first + ' ' + signs[op] + ' ' + second
            if (value === target) {
              return [target + ' = ' + expr]
            }
            next.push([value, '(' + expr + ')'])
            seen[value] = 1
          }
        }
      }
    }
    if (next.length === 0) {
      break
    }
    layers.push(next)
  }
  return []
})
