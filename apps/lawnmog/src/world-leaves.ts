import { Container3D } from '@pixi/3d'
import * as Option from 'effect/Option'

import { lotOrigin, turfSize } from './street-layout.ts'
import { solid } from './world-art.ts'

function patchCenter(index: number, cell: number) {
  const origin = lotOrigin(index)
  return {
    x: origin.x + (((cell % 8) + 0.5) / 8 - 0.5) * turfSize * origin.side,
    z: origin.z + ((Math.floor(cell / 8) + 0.5) / 8 - 0.5) * turfSize * origin.side,
  }
}

type Gust = {
  source: ReturnType<typeof patchCenter>
  target: ReturnType<typeof patchCenter>
  elapsed: number
  height: number
  duration: number
  amount: number
}

export function leafFlights(root: Container3D) {
  const colors = [0xb9_57_24, 0xe4_a6_3c, 0x99_40_2a]
  // Reuse the oldest burst when a player keeps the throttle down.
  const bursts = Array.from({ length: 4 }, () => {
    const group = root.addChild(new Container3D())
    group.visible = false
    const leaves = Array.from({ length: 14 }, (_, i) =>
      solid(group, colors[i % colors.length] ?? 0xb9_57_24, 0, 0, 0, 0.19, 0.035, 0.12, 'leaf')
    )
    return { group, leaves, flight: Option.none<Gust>() }
  })
  let cursor = 0
  return {
    send(from: number, cell: number, to: number, landing: number, amount: number) {
      const source = patchCenter(from, cell)
      const target = patchCenter(to, landing)
      const distance = Math.hypot(target.x - source.x, target.z - source.z)
      const burst = bursts[cursor]
      if (burst !== undefined) {
        burst.flight = Option.some({
          source,
          target,
          elapsed: 0,
          height: Math.min(9, 0.35 + distance * 0.2),
          duration: Math.min(3.2, 0.35 + distance / 19),
          amount,
        })
      }
      cursor = (cursor + 1) % bursts.length
    },
    update(dt: number) {
      for (const burst of bursts) {
        const flight = Option.getOrUndefined(burst.flight)
        if (flight === undefined) {
          continue
        }
        flight.elapsed += dt
        const progress = Math.min(1, flight.elapsed / flight.duration)
        if (progress >= 1) {
          burst.group.visible = false
          burst.flight = Option.none()
          continue
        }
        burst.group.visible = true
        const arc = Math.sin(progress * Math.PI)
        burst.group.position.set(
          flight.source.x + (flight.target.x - flight.source.x) * progress,
          0.1 + arc * flight.height,
          flight.source.z + (flight.target.z - flight.source.z) * progress
        )
        for (const [i, leaf] of burst.leaves.entries()) {
          leaf.visible = i < Math.ceil(flight.amount / 3)
          const spin = i * 2.39 + progress * 7
          leaf.position.set(Math.cos(spin) * arc * 0.43, Math.sin(spin * 1.8) * arc * 0.17, Math.sin(spin) * arc * 0.43)
          leaf.rotation.x = spin
          leaf.rotation.z = spin * 0.73
        }
      }
    },
  }
}
