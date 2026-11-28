import type { Direction, Lawn, Season } from './model.ts'
import { gridSize } from './model.ts'
import { estateIndex, lotColumn, lotOrigin, streetIndex } from './street-layout.ts'

const seasons = ['autumn', 'winter', 'spring', 'summer'] as const
export const seasonTicks = 3

export function seasonAt(tick: number): Season {
  return seasons[Math.floor(tick / seasonTicks) % seasons.length] ?? 'autumn'
}

export function seasonalCover({
  patch,
  lot,
  cell,
  tick,
  season,
  maintained,
}: {
  patch: Lawn
  lot: number
  cell: number
  tick: number
  season: Season
  maintained: boolean
}) {
  const exposed = (cell * 13 + lot * 17 + tick * 9) % 7 < 3
  const fall = season === 'autumn' && exposed ? 12 : season === 'autumn' ? 0 : -1
  const sprouts = season === 'spring' || season === 'summer' ? (exposed ? (season === 'spring' ? 14 : 8) : 0) : -2
  return {
    leaves: Math.max(0, Math.min(100, patch.leaves + fall - (maintained ? 15 : 0))),
    weeds: Math.max(0, Math.min(100, patch.weeds + sprouts - (maintained ? 14 : 0))),
  }
}

export type LeafLanding =
  | { kind: 'lawn'; index: number; cell: number }
  | { kind: 'estate'; cell: number }
  | { kind: 'cleared' }

// Crossing a side fence enters the next home. Crossing the front curb enters the facing home.
export function leafLanding({
  source,
  cell,
  direction,
  distance,
  lotCount,
}: {
  source: number
  cell: number
  direction: Direction
  distance: number
  lotCount: number
}): LeafLanding {
  let index = source
  let col = cell % gridSize
  let row = Math.floor(cell / gridSize)
  const [dx, dz] = ({ east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] } as const)[direction]
  for (let step = 0; step < distance; step++) {
    const side = lotOrigin(index).side
    col += dx * side
    row += dz * side
    if (row < 0) {
      return { kind: 'cleared' }
    }
    if (row >= gridSize) {
      index = streetIndex({ column: lotColumn(index), opposite: side === 1 })
      row = gridSize - 1
      col = gridSize - 1 - col
    } else if (col < 0 || col >= gridSize) {
      index = streetIndex({ column: lotColumn(index) + dx, opposite: side === -1 })
      col = (col + gridSize) % gridSize
    }
    if (index === estateIndex) {
      return { kind: 'estate', cell: row * gridSize + col }
    }
    if (index >= lotCount) {
      return { kind: 'cleared' }
    }
  }
  return { kind: 'lawn', index, cell: row * gridSize + col }
}
