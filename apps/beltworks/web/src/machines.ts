import {
  BUFFER_CAPACITY,
  productionSpeed,
  clockwise,
  counterClockwise,
  beltRate,
  craftPeriod,
  extractorPeriod,
  milestoneFor,
} from '@garage/beltworks-domain'
import type { BuildingState, Direction, initial } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { BitmapFont, BitmapText, Container, Graphics, GraphicsContext, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Renderer } from 'pixi.js'

import type { beltShape } from './beltShape.ts'

export const tile = 48
const gold = 0xfb_bf_24
const aqua = 0x5e_ea_d4
export const ink = 0x16_20_2a
const colors = [
  0xcb_d5_e1, 0x5e_ea_d4, 0xfb_bf_24, 0xc0_84_fc, 0x60_a5_fa, 0xfb_71_85, 0xa3_e6_35, 0xfb_92_3c, 0x38_bd_f8,
  0xf4_72_b6,
]
export const oreColor = (value: number) =>
  colors[value % colors.length] ?? colors[1 + ((value + Math.floor(value / 9)) % 9)] ?? 0xff_da_86

function housing(g: Graphics, r: number, cut: number, face: number, rim: number) {
  const corners = [
    -r + cut,
    -r,
    r - cut,
    -r,
    r,
    -r + cut,
    r,
    r - cut,
    r - cut,
    r,
    -r + cut,
    r,
    -r,
    r - cut,
    -r,
    -r + cut,
  ]
  g.save().translateTransform(0, 3).poly(corners).setFillStyle({ color: 0x05_09_0d, alpha: 0.45 }).fill().restore()
  g.poly(corners).fill(face).stroke({ color: rim, width: 2 })
}
const mint = 0x66_f0_d8
const amber = 0xf6_c0_75

function outputNozzle(g: Graphics, rotation: number, color = mint) {
  g.save()
    .rotateTransform(rotation)
    .roundRect(-10, -23, 20, 10, 2)
    .fill(ink)
    .rect(-10, -23, 3, 8)
    .rect(7, -23, 3, 8)
    .fill(color)
    .poly([-7, -15, 0, -23, 7, -15, 0, -17])
    .fill(color)
    .restore()
}

function intake(g: Graphics, rotation: number, color = 0x91_aa_b4) {
  g.save()
    .rotateTransform(rotation)
    .roundRect(-8, -23, 16, 7, 2)
    .fill(ink)
    .moveTo(-4, -21)
    .lineTo(0, -18)
    .lineTo(4, -21)
    .stroke({ color, width: 2 })
    .restore()
}

function collar(g: Graphics, rotation: number, edge = 24) {
  g.save()
    .rotateTransform(rotation)
    .rect(-14, -edge, 28, 10)
    .fill(0x42_5b_67)
    .rect(-11, -edge, 22, 9)
    .fill(0x0b_12_18)
    .rect(-9, -edge + 4, 18, 2)
    .fill(0x39_4a_52)
    .restore()
}
const fontFamily = 'Beltworks labels'
export function installLabels() {
  BitmapFont.install({
    name: fontFamily,
    style: { fontFamily: 'monospace', fontSize: 26, fontWeight: 'bold', fill: 0xff_ff_ff },
    resolution: 2,
    chars: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ·÷×−–✦↑→↓←≠=+ /',
  })
}
export function label({
  text,
  size,
  fill,
  x = 0,
  y = 0,
}: {
  text: string
  size: number
  fill: number
  x?: number
  y?: number
}) {
  const node = new BitmapText({
    text,
    style: { fontFamily, fontSize: size, fill },
  })
  node.anchor.set(0.5)
  node.position.set(x, y)
  return node
}
function arrow(g: Graphics, x: number, y: number, color: number) {
  g.moveTo(x - 4, y + 2)
    .lineTo(x, y - 2)
    .lineTo(x + 4, y + 2)
    .stroke({ width: 2, color })
}
// Geometry is shared across machines. Each animation has a bounded set of phases.
const animationFrames: Record<string, Array<GraphicsContext>> = {}
const chevron = new GraphicsContext().moveTo(-4, 4).lineTo(0, -2).lineTo(4, 4).stroke({ width: 2, color: 0x5f_9c_9c })
const emptyDetail = new GraphicsContext()
function frame(group: string, phase: number, paint: (g: GraphicsContext) => void) {
  const frames = (animationFrames[group] ??= [])
  const existing = frames[phase]
  if (existing !== undefined) {
    return existing
  }
  const context = new GraphicsContext()
  context.batchMode = 'batch'
  paint(context)
  frames[phase] = context
  return context
}
const angles = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 }
const spacing = tile / 3
function placeChevrons(
  marks: Container<Graphics>,
  lanes: Array<number>,
  inletCapped: boolean,
  capped: boolean,
  offset: number
) {
  let index = 0
  for (const side of lanes) {
    const radius = tile / 2
    const length = side === 0 ? tile : (Math.PI * radius) / 2
    const count = Math.floor(length / spacing)
    const margin = (length - count * spacing) / 2
    for (let i = 0; i < count; i++) {
      const along = margin + i * spacing + offset
      const mark = marks.getChildAt(index++)
      mark.visible = !((inletCapped && along < 12) || (capped && along > length - 8))
      if (side === 0) {
        mark.position.set(0, radius - along)
        mark.rotation = 0
      } else {
        const angle = along / radius
        mark.position.set(side * radius * (1 - Math.sin(angle)), radius * (Math.cos(angle) - 1))
        mark.rotation = side * (angle - Math.PI / 2)
      }
    }
  }
}

function spriteSheet(
  renderer: Renderer,
  stride: number,
  count: number,
  paint: (cell: Container, phase: number) => void
) {
  const sheet = new Container()
  const columns = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const cell = sheet.addChild(new Container())
    cell.position.set(((i % columns) + 0.5) * stride, (Math.floor(i / columns) + 0.5) * stride)
    paint(cell, i)
  }
  const atlas = renderer.generateTexture({
    target: sheet,
    frame: new Rectangle(0, 0, columns * stride, Math.ceil(count / columns) * stride),
    resolution: 2,
    antialias: true,
  })
  sheet.destroy({ children: true })
  return Arr.makeBy(
    count,
    (i) =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle((i % columns) * stride, Math.floor(i / columns) * stride, stride, stride),
      })
  )
}

function extractionArc(phase: number) {
  return frame('extraction', phase, (g) => {
    g.beginPath()
      .arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, phase / 128))
      .stroke({
        color: aqua,
        width: 1.5,
      })
  })
}

function beltFrames(renderer: Renderer) {
  const atlases: Record<string, Array<Texture>> = {}
  return (drawPlate: () => Graphics, lanes: Array<number>, inletCapped: boolean, capped: boolean) => {
    const key = Arr.join(Arr.map(lanes, String), ',') + '/' + inletCapped + '/' + capped
    const existing = atlases[key]
    if (existing !== undefined) {
      return existing
    }
    const plate = drawPlate()
    return (atlases[key] = spriteSheet(renderer, tile + 4, 64, (cell, phase) => {
      cell.addChild(new Graphics(plate.context))
      const marks = cell.addChild(new Container<Graphics>())
      for (const side of lanes) {
        for (let j = 0; j < (side === 0 ? 3 : 2); j++) {
          marks.addChild(new Graphics(chevron))
        }
      }
      placeChevrons(marks, lanes, inletCapped, capped, (spacing * phase) / 64)
    }))
  }
}
function plateKey(state: BuildingState, dir: Direction, ore: string) {
  switch (state.kind) {
    case 'buffer':
      return state.kind + dir + state.count
    case 'filter':
      return state.kind + dir
    case 'extractor':
      return state.kind + oreColor(Number(ore))
    case 'beacon':
      return state.kind + (state.fuelTicks > 0)
    case 'combiner':
      return state.kind + state.op
    default:
      return state.kind
  }
}

export function machineTextures(renderer: Renderer) {
  const textures: Record<string, Texture> = {}
  let arcs: Array<Texture> = []
  return {
    belts: beltFrames(renderer),
    extraction(phase: number) {
      if (arcs.length === 0) {
        arcs = spriteSheet(renderer, 26, 129, (cell, i) => cell.addChild(new Graphics(extractionArc(i))))
      }
      return arcs[phase]
    },
    plate(graphics: Graphics, state: BuildingState, dir: Direction, ore: string) {
      const key = plateKey(state, dir, ore)
      const existing = textures[key]
      if (existing !== undefined) {
        return existing
      }
      const radius = state.kind === 'hub' ? 50 : 26
      const art = new Graphics(graphics.context)
      const texture = renderer.generateTexture({
        target: art,
        frame: new Rectangle(-radius, -radius, radius * 2, radius * 2),
        resolution: 3,
        antialias: true,
      })
      art.destroy()
      textures[key] = texture
      return texture
    },
  }
}
export class Machine extends Container {
  frames?: Array<Texture>
  private bodySprite?: Sprite
  private readonly textures?: ReturnType<typeof machineTextures>
  constructor(textures?: ReturnType<typeof machineTextures>) {
    super()
    if (textures !== undefined) {
      this.textures = textures
    }
  }
  readonly mounted = performance.now()
  readonly plate = this.addChild(new Graphics())
  readonly detail = this.addChild(new Graphics(emptyDetail))
  private arc?: Sprite
  private rotor?: Graphics
  private hubProgress = -1
  private hubDetail?: GraphicsContext
  private readonly chevrons = this.addChild(new Container<Graphics>())
  private glyph?: BitmapText
  private inputA?: BitmapText
  private inputB?: BitmapText
  get symbol() {
    return (this.glyph ??= this.addChild(label({ text: '', size: 18, fill: 0xee_f5_ef })))
  }
  get a() {
    return (this.inputA ??= this.addChild(label({ text: '', size: 10, fill: aqua })))
  }
  get b() {
    return (this.inputB ??= this.addChild(label({ text: '', size: 10, fill: gold })))
  }
  state: BuildingState = { kind: 'belt' }
  facing: Direction = 'N'
  update(state: BuildingState, dir: Direction, ore = '') {
    if (this.textures !== undefined && state.kind === 'belt') {
      this.facing = dir
      this.label = state.kind
      this.state = state
      this.plate.rotation = angles[dir]
      return
    }
    const previous = this.state
    if (this.label === state.kind && this.facing === dir) {
      this.state = state
      switch (state.kind) {
        case 'combiner':
          if (previous.kind === 'combiner' && previous.op === state.op) {
            this.a.text = Option.match(state.slotA, { onNone: () => 'A', onSome: String })
            this.b.text = Option.match(state.slotB, { onNone: () => 'B', onSome: String })
            return
          }
          break
        case 'beacon':
          if (previous.kind === 'beacon' && previous.fuelTicks > 0 === state.fuelTicks > 0) {
            return
          }
          break
        case 'buffer':
          if (
            previous.kind === 'buffer' &&
            previous.count === state.count &&
            Option.getOrUndefined(previous.storedValue) === Option.getOrUndefined(state.storedValue)
          ) {
            return
          }
          break
        case 'filter':
          if (previous.kind === 'filter' && previous.targetValue === state.targetValue) {
            return
          }
          break
        case 'extractor':
          if (this.symbol.text === ore) {
            return
          }
          break
        default:
          return
      }
    }
    this.plate.visible = true
    if (this.bodySprite !== undefined) {
      this.bodySprite.visible = false
    }
    this.chevrons.visible = state.kind === 'belt'
    this.detail.context = emptyDetail
    if (this.arc !== undefined) {
      this.arc.visible = false
    }
    this.hubProgress = -1
    if (this.rotor !== undefined) {
      this.rotor.visible = state.kind === 'extractor'
    }
    this.facing = dir
    this.label = state.kind
    this.state = state
    this.symbol.rotation = 0
    this.a.rotation = 0
    this.b.rotation = 0
    this.a.alpha = 1
    this.b.alpha = 1
    this.plate.rotation = angles[dir]
    this.detail.rotation = this.plate.rotation
    this.chevrons.rotation = this.plate.rotation
    const g = this.plate.clear()
    g.context.batchMode = 'batch'
    this.symbol.text = ''
    this.symbol.style.fontSize = 18
    this.a.text = ''
    this.b.text = ''
    switch (state.kind) {
      case 'belt':
        this.track({ kind: 'straight', inDirs: [], connected: false })
        break
      case 'tunnelIn':
      case 'tunnelOut': {
        const sign = state.kind === 'tunnelIn' ? 1 : -1
        g.save().scaleTransform(1, sign)
        collar(g, Math.PI)
        housing(g, 19, 5, 0x35_49_56, 0x68_80_8a)
        g.roundRect(-15, 0, 30, 15, 3).fill(0x08_0f_16).roundRect(-17, -18, 34, 20, 4).fill(0x52_69_78)
        for (const x of [-12, -5, 2, 9]) {
          g.moveTo(x, 4)
            .lineTo(x + 4, 0)
            .stroke({ width: 3, color: sign === 1 ? aqua : gold })
        }
        g.restore()
        g.save()
          .translateTransform(0, -9 * sign)
          .poly([0, -8, 9, 1, 4, 1, 4, 6, -4, 6, -4, 1, -9, 1])
          .fill(sign === 1 ? amber : mint)
          .stroke({ color: ink, width: 2 })
          .restore()
        break
      }
      case 'extractor':
        housing(g, 20, 8, 0x2d_41_4a, 0x6a_83_8a)
        outputNozzle(g, 0)
        for (const x of [-13, 13]) {
          for (const y of [-13, 13]) {
            g.circle(x, y, 1.6).fill(0x99_ab_ad)
          }
        }
        g.circle(0, 0, 14)
          .fill(0x10_1b_22)
          .stroke({ color: oreColor(Number(ore)), width: 2 })
        this.symbol.text = ore
        break
      case 'filter':
        housing(g, 20, 5, 0x2b_42_48, 0x79_ab_a3)
        for (const angle of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
          collar(g, angle)
        }
        g.moveTo(0, 19).lineTo(0, -17).stroke({ color: aqua, width: 3 })
        g.moveTo(0, 8).quadraticCurveTo(4, 1, 18, 1).stroke({ color: gold, width: 3 })
        outputNozzle(g, 0)
        outputNozzle(g, Math.PI / 2, amber)
        intake(g, Math.PI)
        g.save()
          .rotateTransform(-g.rotation)
          .roundRect(-14, -8, 28, 16, 4)
          .fill(ink)
          .stroke({ color: aqua, width: 1 })
          .restore()
        this.symbol.text = String(state.targetValue)
        this.symbol.style.fontSize = 13
        break
      case 'beacon':
        g.rotation = 0
        this.detail.rotation = 0
        for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          collar(g, angle)
          g.save().rotateTransform(angle)
          arrow(g, 0, 21, 0x78_aa_a8)
          g.restore()
        }
        housing(g, 19, 7, 0x37_32_2b, 0xa2_83_55)
        g.ellipse(0, 9, 14, 6).fill(ink).stroke({ color: 0xb4_90_58, width: 2 })
        g.poly([-8, 9, -3, -18, 3, -18, 8, 9]).fill(0xc5_9a_60)
        for (const y of [-10, -4, 2, 8]) {
          g.ellipse(0, y, 7 + y / 4, 2.5).stroke({ color: state.fuelTicks > 0 ? aqua : 0x4c_67_67, width: 2 })
        }
        g.circle(0, -15, 3).fill(state.fuelTicks > 0 ? 0xb5_ff_f5 : 0x70_83_80)
        break
      case 'buffer': {
        g.save().rotateTransform(-g.rotation)
        g.roundRect(-18, -15, 36, 31, 7).fill(0x25_3d_48).stroke({ color: 0x83_a5_af, width: 2 })
        g.ellipse(0, -13, 17, 5).fill(0x46_63_70).stroke({ color: 0x83_a5_af, width: 1 })
        g.rect(11, -7, 3, 19).fill(ink)
        const level = (19 * state.count) / BUFFER_CAPACITY
        if (level > 0) {
          g.rect(11, 12 - level, 3, level).fill(aqua)
        }
        g.restore()
        for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
          intake(g, angle)
        }
        outputNozzle(g, 0)
        this.symbol.text = Option.match(state.storedValue, { onNone: () => '–', onSome: String })
        this.symbol.style.fontSize = Math.min(14, 40 / this.symbol.text.length)
        this.a.text = state.count + '/' + BUFFER_CAPACITY
        break
      }
      case 'splitter':
        housing(g, 18, 8, 0x35_44_4f, 0x60_78_88)
        for (const angle of [Math.PI, Math.PI / 2, -Math.PI / 2]) {
          collar(g, angle)
        }
        for (const side of [-1, 1]) {
          g.moveTo(0, 22)
            .quadraticCurveTo(0, 0, side * 11, 0)
            .lineTo(side * 24, 0)
            .stroke({ color: 0x0b_12_18, width: 10 })
        }
        intake(g, Math.PI)
        outputNozzle(g, -Math.PI / 2)
        outputNozzle(g, Math.PI / 2, amber)
        break
      case 'combiner': {
        const trim = { add: aqua, sub: 0xfb_71_85, mul: gold, div: 0xb3_91_e9 }[state.op]
        housing(g, 20, 6, state.op === 'div' ? 0x21_52_58 : 0x28_3b_46, trim)
        outputNozzle(g, 0, amber)
        intake(g, -Math.PI / 2, aqua)
        intake(g, Math.PI / 2, gold)
        g.circle(0, 0, 10).fill(0x10_1a_22).stroke({ width: 1, color: trim })
        for (const x of [-14, 14]) {
          g.circle(x, 8, 6.5)
            .fill(0x09_10_18)
            .stroke({ width: 1, color: x < 0 ? aqua : gold, alpha: 0.65 })
        }
        this.symbol.text = { add: '+', sub: '−', mul: '×', div: '÷' }[state.op]
        this.a.text = Option.match(state.slotA, { onNone: () => 'A', onSome: String })
        this.b.text = Option.match(state.slotB, { onNone: () => 'B', onSome: String })
        break
      }
      case 'trash':
        housing(g, 20, 5, 0x39_49_53, 0x67_7b_80)
        g.roundRect(-15, -13, 30, 26, 3).fill(0x09_0e_13)
        for (const y of [-17, 17]) {
          for (const x of [-12, -4, 4, 12]) {
            g.moveTo(x - 2, y + 2)
              .lineTo(x + 2, y - 2)
              .stroke({ width: 3, color: gold })
          }
        }
        break
      case 'hub':
        housing(g, 45, 14, 0x32_44_4c, 0xbe_9f_6b)
        for (let i = 0; i < 4; i++) {
          g.save()
            .rotateTransform((i * Math.PI) / 2)
            .poly([-37, -48, 37, -48, 37, -43, 15, -37, -15, -37, -37, -43])
            .fill(0x0b_12_18)
            .stroke({ width: 1, color: 0x53_73_88 })
          for (const x of [-24, 24]) {
            g.moveTo(x - 5, -45)
              .lineTo(x + 5, -45)
              .stroke({ width: 2, color: 0x36_4d_5d })
          }
          collar(g, 0, 48)
          g.restore()
        }
        for (const x of [-1, 1]) {
          for (const y of [-1, 1]) {
            g.moveTo(x * 37, y * 19)
              .lineTo(x * 37, y * 28)
              .lineTo(x * 28, y * 37)
              .lineTo(x * 19, y * 37)
              .stroke({ width: 2, color: 0x56_68_70 })
            g.circle(x * 32, y * 32, 2)
              .fill(ink)
              .circle(x * 32, y * 32 - 0.5, 1)
              .fill(gold)
          }
        }
        g.circle(0, 0, 32)
          .fill(0x15_20_29)
          .stroke({ width: 3, color: 0x64_76_79 })
          .circle(0, 0, 27)
          .fill(0x10_1a_21)
          .stroke({ color: 0x37_4b_53, width: 1 })
        this.symbol.style.fontSize = 26
        this.a.text = 'HUB'
        break
    }
    if (this.textures !== undefined && state.kind !== 'belt') {
      const sprite = (this.bodySprite ??= this.addChildAt(new Sprite(), 0))
      sprite.anchor.set(0.5)
      sprite.rotation = g.rotation
      sprite.texture = this.textures.plate(g, state, dir, ore)
      sprite.visible = true
      g.visible = false
    }
    this.symbol.visible = this.symbol.text !== '' || state.kind === 'hub'
    this.a.visible = this.a.text !== ''
    this.b.visible = this.b.text !== ''
    const cos = Math.cos(g.rotation),
      sin = Math.sin(g.rotation)
    this.a.position.set(-14 * cos - 8 * sin, -14 * sin + 8 * cos)
    this.b.position.set(14 * cos - 8 * sin, 14 * sin + 8 * cos)
    if (state.kind === 'buffer') {
      this.a.position.set(-2, 10)
    }
    if (state.kind === 'hub') {
      this.a.position.set(0, -19)
    }
  }
  private lanes: Array<number> = []
  private inletCapped = true
  private capped = true
  track(shape: ReturnType<typeof beltShape>) {
    this.lanes = []
    for (const dir of shape.inDirs) {
      this.lanes.push(dir === counterClockwise[this.facing] ? -1 : dir === clockwise[this.facing] ? 1 : 0)
    }
    if (this.lanes.length === 0) {
      this.lanes.push(0)
    }
    this.capped = !shape.connected
    this.inletCapped = shape.inDirs.length === 0
    if (this.textures !== undefined) {
      this.frames = this.textures.belts(() => this.drawRails(), this.lanes, this.inletCapped, this.capped)
      return
    }
    this.drawRails()
    const count = Arr.reduce(this.lanes, 0, (sum, side) => sum + (side === 0 ? 3 : 2))
    while (this.chevrons.children.length < count) {
      this.chevrons.addChild(new Graphics(chevron))
    }
    while (this.chevrons.children.length > count) {
      this.chevrons.removeChildAt(count).destroy()
    }
  }
  private drawRails() {
    const g = this.plate.clear()
    const entry = this.inletCapped ? 19 : 24
    const exit = this.capped ? 19 : 24
    for (const [width, color] of [
      [34, 0x06_0a_0e],
      [32, 0x36_4d_5d],
      [28, 0x53_73_88],
      [26, 0x0b_12_18],
    ] as const) {
      for (const side of this.lanes) {
        if (side === 0) {
          g.moveTo(0, entry).lineTo(0, -exit).stroke({ width, color, cap: 'butt' })
        } else {
          const radius = tile / 2
          const sweep = Math.acos(1 - exit / radius)
          // Fill the rail between two arcs with a flat cross-section at each seam.
          const band: Array<number> = []
          for (const edge of [1, -1]) {
            const r = radius + (edge * width) / 2
            for (let i = 0; i <= 16; i++) {
              const angle = (sweep * (edge === 1 ? i : 16 - i)) / 16
              band.push(side * (radius - r * Math.sin(angle)), r * Math.cos(angle) - radius)
            }
          }
          g.poly(band).fill(color)
        }
      }
    }
    for (const y of [this.inletCapped ? 19 : undefined, this.capped ? -19 : undefined]) {
      if (y !== undefined) {
        g.roundRect(-15, y - 2, 30, 4, 2).fill(0x64_7c_88)
      }
    }
    return g
  }
  scroll(distance: number) {
    const phase = ((distance * tile) / spacing) % 1
    placeChevrons(this.chevrons, this.lanes, this.inletCapped, this.capped, phase * spacing)
  }
  animate(tick: number, p: typeof initial, flowLens = false) {
    const state = this.state
    switch (state.kind) {
      case 'tunnelIn':
      case 'tunnelOut':
      case 'buffer':
      case 'filter':
        break
      case 'trash':
        this.detail.context = frame('trash', tick % 20, (g) => {
          for (const side of [-1, 1]) {
            g.roundRect(side * 7 - 5, -12, 10, 24, 4).fill(0x60_74_81)
            for (let y = -11; y < 9; y += 5) {
              const shift = side === 1 ? (tick / 4) % 5 : 5 - ((tick / 4) % 5)
              g.moveTo(side * 7 - 4, y + shift)
                .lineTo(side * 7 + 4, y + shift + side * 2)
                .stroke({ color: ink, width: 2 })
            }
          }
        })
        break
      case 'belt': {
        const distance = (tick * Math.round(beltRate(p.upgrades.beltSpeed) * productionSpeed(p))) / 1000
        this.scroll(distance)
        break
      }
      case 'extractor': {
        const period = extractorPeriod(p.upgrades.extractorSpeed) / productionSpeed(p)
        const fraction = 1 - state.remainingTicks / period
        if (this.rotor === undefined) {
          this.rotor = this.addChildAt(
            new Graphics(
              frame('rotor', 0, (g) => {
                for (let i = 0; i < 8; i++) {
                  g.rotate(Math.PI / 4)
                    .rect(-2, -16, 4, 4)
                    .fill(0x98_ae_aa)
                }
              })
            ),
            1
          )
        }
        this.rotor.rotation = this.plate.rotation + (tick / period) * Math.PI
        const phase = Math.round(128 * Math.max(0, Math.min(1, fraction)))
        const texture = this.textures?.extraction(phase)
        if (texture === undefined) {
          this.detail.context = extractionArc(phase)
        } else {
          const sprite = (this.arc ??= this.addChildAt(new Sprite(), this.getChildIndex(this.detail)))
          sprite.anchor.set(0.5)
          sprite.rotation = this.plate.rotation
          sprite.texture = texture
          sprite.visible = true
        }
        break
      }
      case 'beacon':
        if (state.fuelTicks > 0) {
          const phase = Math.floor((((tick * 0.055) % (2 * Math.PI)) * 128) / (2 * Math.PI))
          this.detail.context = frame('beacon', phase, (g) => {
            const angle = (phase * 2 * Math.PI) / 128
            g.save().translate(0, -8).scale(1, 0.48)
            g.circle(0, 0, 15).stroke({ color: aqua, width: 3, alpha: 0.38 })
            g.beginPath()
              .arc(0, 0, 15, angle, angle + Math.PI * 0.7)
              .stroke({ color: 0xcd_ff_f9, width: 3 })
            g.restore()
          })
        } else {
          this.detail.context = emptyDetail
        }
        break
      case 'combiner': {
        const missing = flowLens && Option.isSome(state.slotA) !== Option.isSome(state.slotB)
        const phase =
          state.remainingTicks > 0
            ? Math.round(
                128 *
                  Math.max(
                    0.01,
                    1 - (state.remainingTicks * productionSpeed(p)) / craftPeriod(p.upgrades.combinerSpeed)
                  )
              )
            : 0
        this.detail.context = frame(missing ? 'missing' : 'craft', phase, (g) => {
          if (missing) {
            g.circle(0, 0, 21).stroke({ color: 0xff_83_78, width: 5, alpha: 0.3 })
            g.circle(0, 0, 21).stroke({ color: 0xff_83_78, width: 1.5 })
          }
          if (phase > 0) {
            const start = -Math.PI / 2
            const end = start + (2 * Math.PI * phase) / 128
            g.beginPath().arc(0, 0, 10, start, end).stroke({ color: gold, width: 4, alpha: 0.25 })
            g.beginPath().arc(0, 0, 10, start, end).stroke({ color: gold, width: 1.6 })
          }
        })
        break
      }
      case 'splitter':
        this.detail.context = frame('splitter', state.nextPort, (g) => {
          g.circle(state.nextPort === 0 ? -10 : 10, 0, 3).fill(gold)
        })
        break
      case 'hub': {
        const { requirements } = milestoneFor(p)
        this.symbol.text = Arr.join(
          Arr.map(requirements, ({ value }) => String(value)),
          '·'
        )
        this.symbol.style.fontSize = Math.min(26, 78 / this.symbol.text.length)
        const progress =
          Arr.reduce(requirements, 0, (sum, { value, quota }) => sum + Math.min(1, (p.delivered[value] ?? 0) / quota)) /
          requirements.length
        const start = -Math.PI / 2
        if (this.hubProgress === progress) {
          break
        }
        this.hubProgress = progress
        const g = (this.hubDetail ??= new GraphicsContext()).clear()
        this.detail.context = g
        const end = start + Math.PI * 2 * progress
        if (end > start) {
          g.beginPath().arc(0, 0, 30, start, end).stroke({ width: 7, color: aqua, alpha: 0.22 })
          g.beginPath().arc(0, 0, 30, start, end).stroke({ width: 3.5, color: aqua })
          g.circle(30 * Math.cos(end), 30 * Math.sin(end), 2).fill(gold)
        }
        g.roundRect(-25, 20, 50, 4, 2).fill(ink)
        g.rect(-25, 20, 50 * progress, 4).fill(gold)
        break
      }
    }
  }
}
