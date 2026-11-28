import { judgingIntervalMs } from './block.ts'
import type { BlockView } from './model.ts'
import { estateColumn, lotOrigin, spacing } from './street-layout.ts'

type Point = { x: number; z: number }
const home = { x: estateColumn * spacing + 1.5, z: 4.7 }
const gate = { x: home.x, z: 6.25 }

export function awardPosition(index: number) {
  const origin = lotOrigin(index)
  return { x: origin.x + 2.45 * origin.side, z: origin.z + 5.45 * origin.side, side: origin.side }
}

function leg(from: Point, to: Point, fraction: number) {
  return {
    x: from.x + (to.x - from.x) * fraction,
    z: from.z + (to.z - from.z) * fraction,
    facing: Math.atan2(from.x - to.x, from.z - to.z),
  }
}

function route(points: ReadonlyArray<Point>, fraction: number) {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i]
    if (a !== undefined && b !== undefined) {
      length += Math.hypot(a.x - b.x, a.z - b.z)
    }
  }
  let remaining = length * Math.max(0, Math.min(1, fraction))
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i]
    if (a !== undefined && b !== undefined) {
      const distance = Math.hypot(a.x - b.x, a.z - b.z)
      if (distance > 0 && (remaining <= distance || i === points.length - 1)) {
        return leg(a, b, remaining / distance)
      }
      remaining -= distance
    }
  }
  return { ...home, facing: 0 }
}

function walkTo(index: number) {
  const sign = awardPosition(index)
  const stop = { x: sign.x, z: sign.z + 0.85 * sign.side }
  return [home, gate, { x: stop.x, z: gate.z }, stop]
}

export function ceremonyRoute(view: Pick<BlockView, 'nextJudgingAt' | 'yardWinner' | 'lots'>) {
  const stops: Array<number> = []
  let winner = -1
  for (const [i, lot] of view.lots.entries()) {
    if (!lot.bot) {
      stops.push(i)
    }
    if (lot.id === view.yardWinner) {
      winner = i
    }
  }
  const winningRoute = walkTo(winner)
  return (now: number) => {
    const left = view.nextJudgingAt - now
    const elapsed = judgingIntervalMs - left
    if (winner >= 0 && elapsed >= 0 && elapsed < 24_000) {
      const fraction = Math.min(1, elapsed / 10_000, (24_000 - elapsed) / 10_000)
      const returning = elapsed >= 14_000
      const pose = route(winningRoute, fraction)
      return {
        ...pose,
        facing: pose.facing + (returning ? Math.PI : 0),
        walking: elapsed < 10_000 || returning,
        planted: elapsed >= 11_000,
        caption: 'YARD OF THE WEEK',
      }
    }
    if (left > 0 && left <= 60_000 && stops.length > 0) {
      const progress = (60_000 - left) / 20_000
      const slot = Math.floor(progress)
      const index = stops[(Math.floor(view.nextJudgingAt / judgingIntervalMs) + slot) % stops.length]
      if (index !== undefined) {
        const phase = progress - slot
        const returning = phase >= 0.6
        const pose = route(walkTo(index), returning ? (1 - phase) / 0.4 : Math.min(1, phase / 0.4))
        return {
          ...pose,
          facing:
            phase >= 0.4 && !returning
              ? awardPosition(index).side === 1
                ? 0
                : Math.PI
              : pose.facing + (returning ? Math.PI : 0),
          walking: phase < 0.4 || returning,
          planted: true,
          caption: 'JUDGING YOUR LAWN',
        }
      }
    }
    return { ...home, facing: 0, walking: false, planted: true, caption: '' }
  }
}
