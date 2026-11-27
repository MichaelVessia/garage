import { offsets, TILE_PROGRESS_MAX } from '@garage/beltworks-domain'
import type { BuildingState, Direction, OnTile } from '@garage/beltworks-domain'
import type { Descriptor } from '@typeonce/ritmo'
import { NodeRegistry } from '@typeonce/ritmo-render'
import * as Option from 'effect/Option'
import type { Renderer } from 'pixi.js'
import { Container, Graphics, GraphicsContext, Particle, ParticleContainer, Texture } from 'pixi.js'

import { ink, label, oreColor, tile } from './machines.ts'
import { particleAtlas } from './particleAtlas.ts'

type TileState = Descriptor.Descriptor.Value<typeof OnTile>
type Surface = 'open' | 'entry' | 'exit'

const cargoBodies: Record<number, GraphicsContext> = {}
function cargoBody(c: number) {
  const existing = cargoBodies[c]
  if (existing !== undefined) {
    return existing
  }
  const body = new GraphicsContext()
    .roundRect(-13, -10.5, 26, 26, 8)
    .setFillStyle({ color: 0x05_09_0d, alpha: 0.65 })
    .fill()
    .roundRect(-13, -13, 26, 26, 8)
    .fill(c)
    .stroke({ width: 1, color: ink })
    .roundRect(-10, -10, 20, 20, 6)
    .setFillStyle({ color: 0x10_18_20, alpha: 0.78 })
    .fill()
    .moveTo(-7, -10)
    .quadraticCurveTo(0, -12, 7, -10)
    .stroke({ width: 1, color: 0xff_ff_ff, alpha: 0.75 })
  body.batchMode = 'batch'
  cargoBodies[c] = body
  return body
}
const stallRing = new GraphicsContext().circle(0, 0, 16).stroke({ color: 0xff_b8_51, width: 3 })
export class Cargo extends Particle {
  present = false
  readonly value: number
  private path?: TileState
  private exit: Direction = 'N'
  private surface: Surface = 'open'
  private lastTick = -1
  private crossing = Option.none<{ path: TileState; exit: Direction; surface: Surface }>()
  move(path: TileState, exit: Direction, tick: number, kind?: BuildingState['kind']) {
    const old = this.path
    this.crossing =
      old !== undefined && tick === this.lastTick + 1 && (old.gx !== path.gx || old.gy !== path.gy)
        ? Option.some({ path: old, exit: this.exit, surface: this.surface })
        : Option.none()
    this.lastTick = tick
    this.path = path
    this.exit = exit
    this.surface = 'open'
    if (kind === 'tunnelIn') {
      this.surface = 'entry'
    }
    if (kind === 'tunnelOut') {
      this.surface = 'exit'
    }
    this.stalled = path.progress === TILE_PROGRESS_MAX
    if (this.surface !== 'open' || this.alpha !== 1) {
      this.interpolate(1)
    }
  }

  interpolate(alpha: number) {
    let path = this.path
    if (path === undefined) {
      return
    }
    let exit = this.exit
    let surface = this.surface
    let progress = path.prevProgress + alpha * (path.progress - path.prevProgress)
    if (Option.isSome(this.crossing)) {
      const remaining = TILE_PROGRESS_MAX - this.crossing.value.path.progress
      const distance = alpha * (remaining + path.progress)
      if (distance < remaining) {
        path = this.crossing.value.path
        exit = this.crossing.value.exit
        surface = this.crossing.value.surface
        progress = path.progress + distance
      } else {
        progress = distance - remaining
      }
    }
    const f = progress / TILE_PROGRESS_MAX
    const start = 0.5 * (1 - f) ** 2
    const end = 0.5 * f ** 2
    const from = offsets[path.fromDir]
    const to = offsets[exit]
    this.x = (path.gx + 0.5 + from.gx * start + to.gx * end) * tile
    this.y = (path.gy + 0.5 + from.gy * start + to.gy * end) * tile
    if (this.ring?.visible === true) {
      this.ring.position.set(this.x, this.y)
    }
    let light = 1
    if (surface === 'entry') {
      light = 1 - f
    }
    if (surface === 'exit') {
      light = f
    }
    const exposure = Math.min(1, Math.max(0, (light - 0.45) * 4))
    if (this.alpha !== exposure) {
      this.alpha = exposure
      this.scaleX = this.scaleY = 0.7 + 0.3 * exposure
      this.appearanceChanged?.()
    }
  }
  stalled = false
  private ring?: Graphics
  get pulse() {
    return (this.ring ??= new Graphics({ context: stallRing, visible: false }))
  }
  destroy() {
    this.ring?.destroy()
    this.destroyed = true
  }
  destroyed = false

  private readonly appearanceChanged?: () => void
  constructor(value: number, texture = Texture.EMPTY, appearanceChanged?: () => void) {
    super({ texture, anchorX: 0.5, anchorY: 0.5 })
    this.value = value
    if (appearanceChanged !== undefined) {
      this.appearanceChanged = appearanceChanged
    }
  }
}

function tokenArt(value: number) {
  const art = new Container()
  art.addChild(new Graphics(cargoBody(oreColor(value))))
  art.addChild(label({ text: String(value), size: Math.min(16, 34 / String(value).length), fill: 0xff_ff_ff }))
  return art
}

export function cargoLayer(renderer?: Renderer) {
  const layer = new ParticleContainer<Cargo>({ dynamicProperties: { position: true } })
  const pulses = new Container<Graphics>()
  const atlas = particleAtlas({ renderer: Option.fromUndefinedOr(renderer), layer, size: 32, paint: tokenArt })
  const appearanceChanged = () => layer.update()
  const token = (value: number) => new Cargo(value, atlas.acquire(value), appearanceChanged)
  const registry = NodeRegistry.make<Cargo>({
    attach: (node) => layer.addParticle(node),
    detach: (node) => {
      layer.removeParticle(node)
      node.destroy()
      atlas.release(node.value)
    },
  })
  return { layer, pulses, children: layer.particleChildren, registry, token }
}
