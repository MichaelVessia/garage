import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import { Rectangle, RenderTexture, Texture } from 'pixi.js'
import type { Container, Renderer, ParticleContainer } from 'pixi.js'

// Particles share one texture source. Keep idle values until another value needs their cells.
export function particleAtlas({
  renderer,
  layer,
  size,
  paint,
}: {
  renderer: Option.Option<Renderer>
  layer: Pick<ParticleContainer, 'texture' | 'update'>
  size: number
  paint: (value: number) => Container
}) {
  const slots: Record<string, { texture: Texture; users: number }> = {}
  const free: Array<Rectangle> = []
  const resolution = 3
  let sheet = Option.none<RenderTexture>()

  function grow(renderer: Renderer) {
    const old = Option.getOrUndefined(sheet)
    const oldWidth = old?.width ?? 0
    const width = old === undefined ? 4 * size : old.width * 2
    const atlas = RenderTexture.create({ width, height: width, resolution })
    if (old !== undefined) {
      renderer.renderTarget.copyToTexture(
        old,
        atlas,
        { x: 0, y: 0 },
        { width: old.source.pixelWidth, height: old.source.pixelHeight },
        { x: 0, y: 0 }
      )
      for (const slot of Rec.values(slots)) {
        slot.texture.source = atlas.source
        slot.texture.updateUvs()
      }
      old.destroy(true)
    }
    for (let y = 0; y < width; y += size) {
      for (let x = 0; x < width; x += size) {
        if (x >= oldWidth || y >= oldWidth) {
          free.push(new Rectangle(x, y, size, size))
        }
      }
    }
    sheet = Option.some(atlas)
    layer.texture = atlas
    layer.update()
    return atlas
  }
  function acquire(value: number) {
    if (Option.isNone(renderer)) {
      return Texture.EMPTY
    }
    const slot = slots[value]
    if (slot !== undefined) {
      slot.users++
      return slot.texture
    }
    if (free.length === 0) {
      for (const [key, unused] of Rec.toEntries(slots)) {
        if (unused.users === 0) {
          free.push(unused.texture.frame)
          unused.texture.destroy()
          delete slots[key]
          break
        }
      }
    }
    const atlas = free.length === 0 || Option.isNone(sheet) ? grow(renderer.value) : sheet.value
    const frame = free.pop()
    if (frame === undefined) {
      throw new Error('Missing particle atlas cell')
    }
    const art = paint(value)
    const texture = renderer.value.generateTexture({
      target: art,
      frame: new Rectangle(-size / 2, -size / 2, size, size),
      resolution,
      antialias: true,
    })
    renderer.value.renderTarget.copyToTexture(
      texture,
      atlas,
      { x: 0, y: 0 },
      { width: size * resolution, height: size * resolution },
      { x: frame.x * resolution, y: frame.y * resolution }
    )
    art.destroy({ children: true })
    texture.destroy(true)
    const cell = new Texture({ source: atlas.source, frame })
    slots[value] = { texture: cell, users: 1 }
    return cell
  }
  function release(value: number) {
    const slot = slots[value]
    if (slot !== undefined) {
      slot.users--
    }
  }
  return { acquire, release }
}
