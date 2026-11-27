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
  outputDirections,
  beltRate,
  productionSpeed,
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
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { Renderer } from 'pixi.js'
import { Container, Graphics } from 'pixi.js'

import { beltMeshes } from './beltMesh.ts'
import { beltShape } from './beltShape.ts'
import { cargoLayer } from './cargo.ts'
import type { Cargo } from './cargo.ts'
import { machineTextures, Machine, tile } from './machines.ts'
import { veinLayer } from './veins.ts'
import type { Vein } from './veins.ts'

const Workshop = Descriptor.Service<(tier: BoardTier) => void>()('Beltworks/Workshop')
const Veins = Descriptor.Service<NodeRegistry.NodeRegistry<Vein>>()('Beltworks/Veins')
const Machines = Descriptor.Service<NodeRegistry.NodeRegistry<Machine>>()('Beltworks/Machines')
const Items = Descriptor.Service<{
  registry: NodeRegistry.NodeRegistry<Cargo>
  members?: ReadonlyArray<{ readonly id: number }>
  nodes: Array<Cargo>
}>()('Beltworks/Items')

const MakeVein = Descriptor.Service<(value: number) => Vein>()('Beltworks/MakeVein')
const cellKeys = Arr.makeBy(columns * rows, (i) => key({ gx: i % columns, gy: Math.floor(i / columns) }))
const MakeMachine = Descriptor.Service<() => Machine>()('Beltworks/MakeMachine')
const MakeCargo = Descriptor.Service<(value: number) => Cargo>()('Beltworks/MakeCargo')

export function beaconRadius(resonance: number) {
  return resonance >= 2 ? 3 : 2
}
function beaconAura(g: Graphics, node: { x: number; y: number }, fueled: boolean, radius: number) {
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

export type Burst = Container & { born: number; dx: number; dy: number; ring: boolean; duration: number }
export function createBoard(renderer?: Renderer) {
  const textures = renderer && machineTextures(renderer)
  const world = new Container({ eventMode: 'none' })
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
  if (renderer !== undefined) {
    deck.cacheAsTexture({ resolution: 2, antialias: true })
  }
  const fog = world.addChild(new Graphics())
  let drawnTier = Option.none<BoardTier>()
  const veins = veinLayer(renderer)
  world.addChild(veins.layer)
  const starterRing = world.addChild(
    new Graphics().circle(0, 0, 22).circle(0, 0, 28).stroke({ color: 0x87_ff_d6, width: 2.5 })
  )
  const auras = world.addChild(new Graphics({ label: 'Beacon coverage' }))
  const beaconPreview = world.addChild(new Graphics())
  beaconAura(beaconPreview, { x: 0, y: 0 }, true, 2)
  beaconPreview.visible = false
  const tracks = beltMeshes()
  world.addChild(tracks.layer)
  const buildings = world.addChild(new Container<Machine>({ isRenderGroup: true }))
  const items = cargoLayer(renderer)
  world.addChild(items.pulses, items.layer)
  const preview = world.addChild(new Container())
  const fx = world.addChild(new Container<Burst>({ isRenderGroup: true }))
  const mounting: Array<Machine> = []
  const machines = PixiNodeRegistry.make<Machine>(buildings)
  const ore = veins.registry
  const services = Game.Runtime.services(
    Game.Runtime.service(MakeVein, veins.create),
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
        for (const n of veins.children) {
          n.show(inBounds({ gx: Math.floor(n.x / tile), gy: Math.floor(n.y / tile) }, tier))
        }
        drawnTier = Option.some(tier)
      }
    }),
    Game.Runtime.service(MakeMachine, () => {
      const node = new Machine(textures)
      mounting.push(node)
      return node
    }),
    Game.Runtime.service(MakeCargo, items.token),
    Game.Runtime.service(Veins, ore),
    Game.Runtime.service(Machines, machines),
    Game.Runtime.service(Items, { registry: items.registry, nodes: [] })
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
  let drawnAuras = ''
  function drawAuras() {
    if (!flowLens && Option.isNone(hoveredKey) && Option.isNone(selectedKey)) {
      if (drawnAuras !== '') {
        auras.clear()
        drawnAuras = ''
      }
      return
    }
    const visible = Arr.flatMap(buildings.children, (node) => {
      if (node.state.kind !== 'beacon') {
        return []
      }
      const cell = key({ gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) })
      return flowLens || Option.contains(hoveredKey, cell) || Option.contains(selectedKey, cell)
        ? [{ node, cell, fueled: node.state.fuelTicks > 0 }]
        : []
    })
    const signature = Arr.join(
      Arr.map(visible, ({ cell, fueled }) => cell + '/' + fueled + '/' + auraRadius),
      ','
    )
    if (signature !== drawnAuras) {
      drawnAuras = signature
      auras.clear()
      for (const { node, fueled } of visible) {
        beaconAura(auras, node, fueled, auraRadius)
      }
    }
  }
  return {
    setFlowLens(enabled: boolean) {
      if (!enabled && flowLens) {
        for (const pulse of items.pulses.children) {
          pulse.visible = false
        }
      }
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
    beaconPreview,
    fx,
    services,
    buildingAt,
    machines,
    mounting,
    resizeBelt: tracks.resize,
    ore,
    tracks: ({ index, tick, p }: BoardStats) => {
      const at = buildingAt(index.buildings)
      const distance = (tick * Math.round(beltRate(p.upgrades.beltSpeed) * productionSpeed(p))) / TILE_PROGRESS_MAX
      const belts: Array<Machine> = []
      for (const [, node] of machines.entries()) {
        if (node.state.kind === 'belt') {
          node.track(
            beltShape({ cell: { gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) }, dir: node.facing, at })
          )
          if (renderer === undefined) {
            node.scroll(distance)
          } else {
            node.removeFromParent()
            belts.push(node)
          }
        } else if (node.parent !== buildings) {
          buildings.addChild(node)
        }
      }
      if (renderer !== undefined) {
        tracks.rebuild(belts)
        tracks.scroll(distance)
      }
    },
    interpolate: (tick: number, p: typeof initial, alpha: number) => {
      const distance =
        ((tick - 1 + alpha) * Math.round(beltRate(p.upgrades.beltSpeed) * productionSpeed(p))) / TILE_PROGRESS_MAX
      tracks.scroll(distance)
      for (const node of items.children) {
        node.interpolate(alpha)
      }
    },
    animate: (tick: number, p: typeof initial, guideVein = false) => {
      auraRadius = beaconRadius(p.meta.metaUpgrades.beaconResonance)
      beaconPreview.scale.set((2 * auraRadius + 1) / 5)
      drawAuras()
      if (flowLens) {
        const pulseAlpha = 0.55 + 0.25 * Math.sin(tick * 0.12)
        for (const cargo of items.children) {
          const pulse = cargo.pulse
          pulse.visible = cargo.stalled
          if (cargo.stalled) {
            if (pulse.parent === null) {
              items.pulses.addChild(pulse)
            }
            pulse.position.set(cargo.x, cargo.y)
            pulse.scale.set(cargo.scaleX)
            pulse.alpha = cargo.alpha * pulseAlpha
          }
        }
      }
      starterRing.visible = false
      for (const vein of veins.children) {
        if (vein.visible) {
          const pulse = Math.sin(tick * 0.05 + vein.x + vein.y)
          vein.alpha = 0.94 + 0.06 * pulse
          if (guideVein && vein.label === '1') {
            starterRing.position.set(vein.x, vein.y)
            starterRing.scale.set(1.05 + 0.05 * pulse)
            starterRing.alpha = 0.77 + 0.22 * pulse
            starterRing.visible = true
          }
        }
      }
      for (const node of buildings.children) {
        if (node.visible && node.state.kind !== 'belt') {
          node.animate(tick, p, flowLens)
        }
      }
    },
  }
}
export type BoardStats = { p: typeof initial; tick: number; index: Descriptor.Descriptor.Value<typeof GridIndex> }
export const stats = Game.Inspector(
  'Beltworks/View',
  {
    resources: {
      p: Game.System.readResource(Progression),
      t: Game.System.readResource(Time),
      index: Game.System.readResource(GridIndex),
    },
  },
  ({ resources }): BoardStats => ({ p: resources.p.get(), tick: resources.t.get().step, index: resources.index.get() })
)
export const draw = Game.Schedule(
  RenderSync.system(Game, {
    name: 'Beltworks/DrawVeins',
    registry: Veins,
    services: { createVein: MakeVein },
    resources: { progress: Progression },
    renderable: ResourceVein,
    transform: GridCell,
    create: ({ renderable: { value }, services }) => services.createVein(value),
    apply: (n, { transform: t, resources }) => {
      n.place((t.gx + 0.5) * tile, (t.gy + 0.5) * tile)
      n.show(inBounds(t, resources.progress.get().boardTier))
    },
  }),
  RenderSync.system(Game, {
    name: 'Beltworks/DrawBuildings',
    registry: Machines,
    resources: { index: GridIndex },
    services: { ore: Veins, makeMachine: MakeMachine },
    renderable: GridCell,
    transform: Facing,
    select: { building: Game.Query.read(Building) },
    redrawOn: [Building],
    create: ({ services }) => services.makeMachine(),
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
  Game.System(
    'Beltworks/DrawItems',
    {
      queries: {
        cargo: Game.Query({
          selection: {
            item: Game.Query.read(Item),
            tile: Game.Query.read(OnTile),
            position: Game.Query.read(WorldPosition),
          },
        }),
      },
      services: {
        items: Game.System.service(Items),
        machines: Game.System.service(Machines),
        makeCargo: Game.System.service(MakeCargo),
      },
      resources: { time: Game.System.readResource(Time), index: Game.System.readResource(GridIndex) },
    },
    ({ queries, services, resources }) => {
      const { items, machines } = services
      const buildings = resources.index.get().buildings
      const tick = resources.time.get().step
      const { data } = queries.cargo
      const members = queries.cargo.each()
      const { nodes, registry } = items
      if (members !== items.members) {
        nodes.length = 0
        for (const e of members) {
          const value = data.item.get(e).value
          let node = registry.get(e.id)
          if (node !== undefined && node.value !== value) {
            registry.remove(e.id)
            node = undefined
          }
          node ??= registry.ensure(e.id, () => services.makeCargo(value))
          node.present = true
          nodes.push(node)
        }
        for (const [id, node] of registry.entries()) {
          if (!node.present) {
            registry.remove(id)
          }
          node.present = false
        }
        items.members = members
      }
      for (let i = 0; i < members.length; i++) {
        const e = members[i]
        const node = nodes[i]
        if (e === undefined || node === undefined) {
          continue
        }
        const cell = data.tile.get(e)
        const k = cellKeys[cell.gy * columns + cell.gx]
        const id = k === undefined ? undefined : buildings[k]
        const machine = id === undefined ? undefined : machines.get(id)
        const exit =
          machine === undefined
            ? 'N'
            : outputDirections({ state: machine.state, dir: machine.facing, value: node.value })[0]
        node.move(cell, exit, tick, machine?.state.kind)
        const position = data.position.get(e)
        node.x = position.x * tile
        node.y = position.y * tile
      }
    }
  )
)
