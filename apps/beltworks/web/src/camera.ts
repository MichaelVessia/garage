export type Camera = { x: number; y: number; scale: number }

export function expansionCamera({ from, to, elapsed }: { from: Camera; to: Camera; elapsed: number }): Camera {
  const t = 1 - (1 - Math.max(0, Math.min(1, elapsed / 450))) ** 3
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  }
}
