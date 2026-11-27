import { NodeRegistry } from '@typeonce/ritmo-render'
import * as Option from 'effect/Option'
import { Container, Graphics, Particle, ParticleContainer } from 'pixi.js'
import type { Renderer, Texture } from 'pixi.js'

import { ink, label, oreColor } from './machines.ts'
import { particleAtlas } from './particleAtlas.ts'

function veinArt(value: number) {
  const n = new Container(),
    c = oreColor(value)
  const g = n.addChild(new Graphics())
  g.context.batchMode = 'batch'
  for (const radius of [23, 19]) {
    g.circle(0, 0, radius).setFillStyle({ color: c, alpha: 0.06 }).fill()
  }
  for (const [x, y, scale, angle] of [
    [-9, 2, 0.73, -0.55],
    [9, 4, 0.8, 0.55],
    [0, -2, 1, 0.1],
  ] as const) {
    g.save()
      .translateTransform(x, y)
      .rotateTransform(angle)
      .scaleTransform(scale, scale)
      .poly([0, -20, 9, -9, 8, 10, 1, 18, -8, 9, -9, -9])
      .fill(c)
      .poly([0, -20, 2, -7, 1, 18, -8, 9, -9, -9])
      .setFillStyle({ color: ink, alpha: 0.48 })
      .fill()
      .moveTo(0, -20)
      .lineTo(2, -7)
      .lineTo(8, 10)
      .stroke({ color: 0xff_ff_ff, alpha: 0.65, width: 1 })
      .restore()
  }
  g.circle(0, 4, 9).fill(0x12_21_2a).stroke({ color: c, width: 1 })
  n.label = String(value)
  n.addChild(label({ text: String(value), size: 14, fill: 0xf5_f9_f5, y: 4 }))
  return n
}

export class Vein extends Particle {
  readonly label: string
  visible = true
  readonly value: number
  private readonly moved: () => void
  constructor(value: number, texture: Texture, moved: () => void) {
    super({ texture, anchorX: 0.5, anchorY: 0.5 })
    this.moved = moved
    this.value = value
    this.label = String(value)
  }
  place(x: number, y: number) {
    if (this.x !== x || this.y !== y) {
      this.x = x
      this.y = y
      this.moved()
    }
  }
  show(visible: boolean) {
    this.visible = visible
    this.alpha = Number(visible)
  }
}
export function veinLayer(renderer?: Renderer) {
  const layer = new ParticleContainer<Vein>({ dynamicProperties: { color: true } })
  const atlas = particleAtlas({ renderer: Option.fromUndefinedOr(renderer), layer, size: 50, paint: veinArt })
  const registry = NodeRegistry.make<Vein>({
    attach: (node) => layer.addParticle(node),
    detach: (node) => {
      layer.removeParticle(node)
      atlas.release(node.value)
    },
  })
  return {
    layer,
    registry,
    children: layer.particleChildren,
    create: (value: number) => new Vein(value, atlas.acquire(value), () => layer.update()),
  }
}
