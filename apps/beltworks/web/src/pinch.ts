type Position = { x: number; y: number }
type Pair = readonly [Position, Position]

export function pinchCamera({
  before,
  after,
  camera,
  minScale,
  maxScale,
}: {
  before: Pair
  after: Pair
  camera: Position & { scale: number }
  minScale: number
  maxScale: number
}) {
  const distance = ([a, b]: Pair) => Math.hypot(a.x - b.x, a.y - b.y)
  const initial = distance(before)
  const scale = Math.max(
    minScale,
    Math.min(maxScale, initial > 0 ? (camera.scale * distance(after)) / initial : camera.scale)
  )
  const ratio = scale / camera.scale
  return {
    scale,
    x: (after[0].x + after[1].x) / 2 - ((before[0].x + before[1].x) / 2 - camera.x) * ratio,
    y: (after[0].y + after[1].y) / 2 - ((before[0].y + before[1].y) / 2 - camera.y) * ratio,
  }
}
