import type { initial, BoardTier, BuildingAt, Cell } from '@garage/beltworks-domain'
import {
  Building,
  Facing,
  Game,
  GridCell,
  GridIndex,
  Item,
  OnTile,
  Progression,
  ResourceVein,
  Time,
  TILE_PROGRESS_MAX,
  WorldPosition,
  columns,
  boardBounds,
  inBounds,
  key,
  rows,
} from '@garage/beltworks-domain'
import { Descriptor } from '@typeonce/ritmo'
import { PixiNodeRegistry } from '@typeonce/ritmo-pixi'
import { RenderSync } from '@typeonce/ritmo-render'
import type { NodeRegistry } from '@typeonce/ritmo-render'
import * as Option from 'effect/Option'
import { Container, Graphics } from 'pixi.js'

import { beltShape } from './beltShape.ts'
import { ink, label, Machine, oreColor, tile } from './machines.ts'

const Workshop = Descriptor.Service<(tier: BoardTier) => void>()('Beltworks/Workshop')
const Veins = Descriptor.Service<NodeRegistry.NodeRegistry<Container>>()('Beltworks/Veins')
const Machines = Descriptor.Service<NodeRegistry.NodeRegistry<Machine>>()('Beltworks/Machines')
const Items = Descriptor.Service<NodeRegistry.NodeRegistry<Cargo>>()('Beltworks/Items')

class Cargo extends Container {
  stalled = false
  readonly pulse = this.addChild(new Graphics().circle(0, 0, 16).stroke({ color: 0xff_b8_51, width: 3 }))

  constructor() {
    super()
    this.pulse.visible = false
  }
}

function beaconAura(g: Graphics, node: Machine, fueled: boolean, radius: number) {
  const size = tile * (2 * radius + 1)
  const left = node.x - size / 2
  const top = node.y - size / 2
  if (fueled) {
    g.rect(left, top, size, size)
      .setFillStyle({ color: 0x62_e6_e9, alpha: 0.05 })
      .fill()
      .stroke({ color: 0x62_e6_e9, width: 2, alpha: 0.7 })
  } else {
    for (let d = 0; d < size; d += 12) {
      g.moveTo(left + d, top).lineTo(left + d + 7, top)
      g.moveTo(left + d, top + size).lineTo(left + d + 7, top + size)
      g.moveTo(left, top + d).lineTo(left, top + d + 7)
      g.moveTo(left + size, top + d).lineTo(left + size, top + d + 7)
    }
    g.stroke({ color: 0xff_b8_51, width: 2, alpha: 0.65 })
  }
}

export class Burst extends Graphics {
  readonly born = performance.now()
  readonly dx: number
  readonly dy: number
  readonly ring: boolean
  constructor(dx: number, dy: number, ring: boolean) {
    super()
    this.dx = dx
    this.dy = dy
    this.ring = ring
  }
}
export function createBoard() {
  const world = new Container()
  const deck = world.addChild(new Graphics())
  const w = columns * tile,
    h = rows * tile
  deck
    .roundRect(-5, -5, w + 10, h + 10, 6)
    .fill(0x12_1b_23)
    .stroke({ color: 0x49_61_6a, width: 2 })
  for (let radius = 7 * tile; radius >= tile; radius -= tile / 2) {
    deck
      .circle(w / 2, h / 2, radius)
      .setFillStyle({ color: 0x87_b6_9e, alpha: 0.012 })
      .fill()
  }
  for (let x = 0; x <= w; x += tile) {
    deck.moveTo(x, 0).lineTo(x, h)
  }
  for (let y = 0; y <= h; y += tile) {
    deck.moveTo(0, y).lineTo(w, y)
  }
  deck.stroke({ width: 1, color: 0x1c_2a_35, alpha: 0.7 })
  for (let x = 0; x <= w; x += tile) {
    for (let y = 0; y <= h; y += tile) {
      deck
        .moveTo(x - 2, y)
        .lineTo(x + 2, y)
        .moveTo(x, y - 2)
        .lineTo(x, y + 2)
    }
  }
  deck.stroke({ width: 1, color: 0x2b_3f_4e })
  const fog = world.addChild(new Graphics())
  let drawnTier = Option.none<BoardTier>()
  const veins = world.addChild(new Container())
  const starterRing = world.addChild(new Graphics().circle(0, 0, 22).stroke({ color: 0x87_e3_ce, width: 2 }))
  const auras = world.addChild(new Graphics({ label: 'Beacon coverage' }))
  const buildings = world.addChild(new Container<Machine>())
  const items = world.addChild(new Container<Cargo>())
  const preview = world.addChild(new Container())
  const fx = world.addChild(new Container<Burst>())
  const machines = PixiNodeRegistry.make<Machine>(buildings)
  const ore = PixiNodeRegistry.make<Container>(veins)
  const services = Game.Runtime.services(
    Game.Runtime.service(Workshop, (tier) => {
      if (!Option.contains(drawnTier, tier)) {
        const { minX, minY, maxX, maxY } = boardBounds(tier)
        const x = minX * tile,
          y = minY * tile,
          width = (maxX - minX + 1) * tile,
          height = (maxY - minY + 1) * tile
        fog.clear()
        if (width < w || height < h) {
          fog
            .rect(0, 0, w, y)
            .rect(0, y + height, w, h - y - height)
            .rect(0, y, x, height)
            .rect(x + width, y, w - x - width, height)
            .setFillStyle({ color: 0x09_0e_13, alpha: 0.76 })
            .fill()
          for (const [bx, by, bw, bh] of [
            [0, 0, w, y],
            [0, y + height, w, h - y - height],
            [0, y, x, height],
            [x + width, y, w - x - width, height],
          ] as const) {
            for (let d = 0; d < bw + bh; d += 18) {
              fog
                .moveTo(bx + Math.max(0, d - bh), by + Math.min(bh, d))
                .lineTo(bx + Math.min(d, bw), by + Math.max(0, d - bw))
            }
          }
          fog.stroke({ width: 1, color: 0x26_37_43, alpha: 0.36 })
        }
        for (const pad of [4, 0]) {
          const l = x - pad,
            t = y - pad,
            r = x + width + pad,
            b = y + height + pad
          fog
            .poly([l + 7, t, r - 7, t, r, t + 7, r, b - 7, r - 7, b, l + 7, b, l, b - 7, l, t + 7])
            .stroke({ width: pad > 0 ? 3 : 1, color: pad > 0 ? 0x2b_43_52 : 0x6c_d9_c2 })
        }
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const cx = x + (sx === 1 ? 0 : width),
              cy = y + (sy === 1 ? 0 : height)
            fog
              .moveTo(cx + sx * 17, cy)
              .lineTo(cx + sx * 6, cy)
              .lineTo(cx, cy + sy * 6)
              .lineTo(cx, cy + sy * 17)
          }
        }
        fog.stroke({ width: 3, color: 0xe8_b8_6d })
        drawnTier = Option.some(tier)
      }
      for (const [, n] of ore.entries()) {
        n.visible = inBounds({ gx: Math.floor(n.x / tile), gy: Math.floor(n.y / tile) }, tier)
      }
    }),
    Game.Runtime.service(Veins, ore),
    Game.Runtime.service(Machines, machines),
    Game.Runtime.service(Items, PixiNodeRegistry.make<Cargo>(items))
  )
  const buildingAt =
    (buildings: Readonly<Record<string, number>>): BuildingAt =>
    (cell) => {
      const id = buildings[key(cell)]
      const node = id === undefined ? undefined : machines.get(id)
      return node === undefined ? Option.none() : Option.some({ kind: node.state.kind, dir: node.facing })
    }
  let auraRadius = 2
  let flowLens = false
  let hoveredKey = Option.none<string>()
  let selectedKey = Option.none<string>()
  function drawAuras() {
    auras.clear()
    if (!flowLens && Option.isNone(hoveredKey) && Option.isNone(selectedKey)) {
      return
    }
    for (const [, node] of machines.entries()) {
      const cellKey = key({ gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) })
      if (
        node.state.kind === 'beacon' &&
        (flowLens || Option.contains(hoveredKey, cellKey) || Option.contains(selectedKey, cellKey))
      ) {
        beaconAura(auras, node, node.state.fuelTicks > 0, auraRadius)
      }
    }
  }
  return {
    setFlowLens(enabled: boolean) {
      flowLens = enabled
      drawAuras()
    },
    setBeaconFocus(hovered?: Cell, selected?: Cell) {
      hoveredKey = Option.map(Option.fromUndefinedOr(hovered), key)
      selectedKey = Option.map(Option.fromUndefinedOr(selected), key)
      drawAuras()
    },
    world,
    veins,
    buildings,
    items,
    preview,
    fx,
    services,
    buildingAt,
    machines,
    ore,
    tracks: (index: Readonly<Record<string, number>>) => {
      const at = buildingAt(index)
      for (const [, node] of machines.entries()) {
        if (node.state.kind === 'belt') {
          node.track(
            beltShape({ cell: { gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) }, dir: node.facing, at })
          )
        }
      }
    },
    animate: (tick: number, p: typeof initial, guideVein = false) => {
      auraRadius = p.meta.metaUpgrades.beaconResonance >= 2 ? 3 : 2
      drawAuras()
      for (const cargo of items.children) {
        cargo.pulse.visible = flowLens && cargo.stalled
        if (cargo.pulse.visible) {
          cargo.pulse.alpha = 0.55 + 0.25 * Math.sin(tick * 0.12)
        }
      }
      starterRing.visible = false
      for (const vein of veins.children) {
        if (vein.visible) {
          const pulse = Math.sin(tick * 0.05 + vein.x + vein.y)
          vein.alpha = 0.94 + 0.06 * pulse
          if (guideVein && vein.label === '1') {
            starterRing.position.copyFrom(vein.position)
            starterRing.scale.set(1.05 + 0.05 * pulse)
            starterRing.alpha = 0.5 + 0.2 * pulse
            starterRing.visible = true
          }
        }
      }
      for (const [, node] of machines.entries()) {
        if (node.visible) {
          node.animate(tick, p, flowLens)
        }
      }
    },
  }
}
export const stats = Game.Inspector(
  'Beltworks/View',
  {
    resources: {
      p: Game.System.readResource(Progression),
      t: Game.System.readResource(Time),
      index: Game.System.readResource(GridIndex),
    },
  },
  ({ resources }) => ({ p: resources.p.get(), tick: resources.t.get().step, index: resources.index.get() })
)
export const draw = Game.Schedule(
  RenderSync.system(Game, {
    name: 'Beltworks/DrawVeins',
    registry: Veins,
    renderable: ResourceVein,
    transform: GridCell,
    create: ({ renderable: { value } }) => {
      const n = new Container(),
        c = oreColor(value)
      const g = n.addChild(new Graphics())
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
    },
    apply: (n, { transform: t }) => n.position.set((t.gx + 0.5) * tile, (t.gy + 0.5) * tile),
  }),
  RenderSync.system(Game, {
    name: 'Beltworks/DrawBuildings',
    registry: Machines,
    resources: { index: GridIndex },
    services: { ore: Veins },
    renderable: GridCell,
    transform: Facing,
    select: { building: Game.Query.read(Building) },
    redrawOn: [Building],
    create: () => new Machine(),
    apply: (n, { renderable: c, transform: f, data, resources, services }) => {
      const state = data.building.get(),
        hub = state.kind === 'hub'
      n.visible = !hub || (c.gx === columns / 2 - 1 && c.gy === rows / 2 - 1)
      n.position.set((c.gx + (hub ? 1 : 0.5)) * tile, (c.gy + (hub ? 1 : 0.5)) * tile)
      const vein = resources.index.get().veins[key(c)]
      n.update(state, f.dir, vein === undefined ? undefined : services.ore.get(vein)?.label)
    },
  }),
  Game.System(
    'Beltworks/DrawWorkshop',
    { resources: { p: Game.System.readResource(Progression) }, services: { update: Game.System.service(Workshop) } },
    ({ resources, services }) => services.update(resources.p.get().boardTier)
  ),
  RenderSync.system(Game, {
    name: 'Beltworks/DrawItems',
    registry: Items,
    resources: { index: GridIndex },
    services: { machines: Machines },
    select: { tile: Game.Query.read(OnTile) },
    renderable: Item,
    transform: WorldPosition,
    redrawOn: [OnTile],
    create: ({ renderable: { value } }) => {
      const n = new Cargo()
      const c = oreColor(value)
      n.addChild(
        new Graphics()
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
      )
      n.addChild(label({ text: String(value), size: Math.min(16, 34 / String(value).length), fill: 0xff_ff_ff }))
      return n
    },
    apply: (n, { transform: t, data, resources, services }) => {
      const cell = data.tile.get()
      n.stalled = cell.progress === TILE_PROGRESS_MAX
      const id = resources.index.get().buildings[key(cell)]
      const kind = id === undefined ? undefined : services.machines.get(id)?.state.kind
      let surface = 1
      if (kind === 'tunnelIn') {
        surface -= cell.progress / 1000
      } else if (kind === 'tunnelOut') {
        surface = cell.progress / 1000
      }
      const exposure = Math.min(1, Math.max(0, (surface - 0.45) * 4))
      n.alpha = exposure
      n.scale.set(0.7 + 0.3 * exposure)
      n.position.set(t.x * tile, t.y * tile)
    },
  })
)
