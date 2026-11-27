import { clockwise, counterClockwise, neighbor, opposite } from '@garage/beltworks-domain'
import type { BuildingAt, Cell, Direction } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

export function beltShape({ cell, dir, at }: { cell: Cell; dir: Direction; at: BuildingAt }) {
  const left = counterClockwise[dir],
    right = clockwise[dir],
    back = opposite[dir]
  const inDirs = Arr.filter([back, left, right], (side) => {
    const source = at(neighbor(side)(cell))
    if (Option.isNone(source)) {
      return false
    }
    const { kind, dir: facing } = source.value
    if (kind === 'splitter') {
      return facing === clockwise[side] || facing === counterClockwise[side]
    }
    return (
      (kind === 'extractor' || kind === 'belt' || kind === 'combiner' || kind === 'tunnelOut') &&
      facing === opposite[side]
    )
  })
  const output = at(neighbor(dir)(cell))
  const connected = Option.exists(output, ({ kind, dir: facing }) => {
    if (kind === 'combiner') {
      return facing === left || facing === right
    }
    return kind === 'hub' || kind === 'trash' || (kind !== 'extractor' && kind !== 'tunnelOut' && facing !== back)
  })
  const kind =
    inDirs.length > 1 ? 'merge' : inDirs[0] === left ? 'turnLeft' : inDirs[0] === right ? 'turnRight' : 'straight'
  return { kind, inDirs, connected }
}
