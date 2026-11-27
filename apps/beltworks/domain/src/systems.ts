import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'

import {
  beltRate,
  expansionCost,
  expansionUnlock,
  craftPeriod,
  extractorPeriod,
  upgradeCost,
  canAfford,
  pay,
  upgradeLimit,
  upgradeUnlock,
  expireDeliveries,
  deliver,
  productionSpeed,
  coresEarned,
  metaUpgradeCost,
  milestoneFor,
  missionRate,
  surgeInterval,
} from './economy.ts'
import {
  BUFFER_CAPACITY,
  Building,
  CommandQueue,
  CommandRejected,
  Facing,
  Game,
  GridCell,
  GridIndex,
  Item,
  ItemCrafted,
  ItemDelivered,
  MilestoneCompleted,
  MedalUnlocked,
  OnTile,
  Progression,
  ResourceVein,
  TILE_PROGRESS_MAX,
  Time,
  WorldPosition,
  columns,
  rows,
  clockwise,
  toolUnlock,
  inBounds,
  findTunnelPartner,
  counterClockwise,
  initial,
  metaUpgradeLimits,
  key,
  neighbor,
  offsets,
  opposite,
  outputDirections,
} from './model.ts'
import type { BuildingAt, BuildingState, Cell, Command, Direction, MedalId } from './model.ts'

const { Query, System } = Game
const structures = Query({
  selection: { cell: Query.read(GridCell), building: Query.write(Building), facing: Query.write(Facing) },
})
const cargo = Query({
  selection: { item: Query.read(Item), tile: Query.write(OnTile), position: Query.write(WorldPosition) },
})
const veins = Query({ selection: { cell: Query.read(GridCell), vein: Query.read(ResourceVein) } })
const production = {
  queries: { structures, veins, cargo },
  resources: {
    index: System.writeResource(GridIndex),
    progress: System.writeResource(Progression),
    time: System.readResource(Time),
  },
  commands: System.commands(System.spawns(OnTile, Item, WorldPosition), System.despawns(Item)),
  events: {
    medal: System.writeEvent(MedalUnlocked),
    craft: System.writeEvent(ItemCrafted),
    delivery: System.writeEvent(ItemDelivered),
    complete: System.writeEvent(MilestoneCompleted),
  },
}
type TransportContext = Parameters<Parameters<typeof System<'Beltworks/Production', typeof production>>[2]>[0]
function unlock(
  {
    resources,
    events,
  }: { resources: Pick<TransportContext['resources'], 'progress'>; events: Pick<TransportContext['events'], 'medal'> },
  medal: MedalId
) {
  const p = resources.progress.get()
  if (!p.meta.medals.includes(medal)) {
    resources.progress.set({ ...p, meta: { ...p.meta, medals: [...p.meta.medals, medal] } })
    events.medal.emit({ medal })
  }
}
const buildingDraft = (cell: Cell, dir: Direction, state: BuildingState) =>
  Game.Command.spawn([GridCell, { gx: cell.gx, gy: cell.gy }], [Facing, { dir }], [Building, state])
function veinLayout(seed: number, richness: number) {
  const cells: Record<string, Cell & { value: number }> = {}
  const sites = [
    { gx: 14, gy: 12, value: 1, width: 1, height: 1, axis: 'x' },
    { gx: 21, gy: 13, value: 2, width: 1, height: 1, axis: 'x' },
    { gx: 17, gy: 6, value: 3, width: 2, height: 1, axis: 'x' },
    { gx: 10, gy: 12, value: 4, width: 1, height: 2, axis: 'y' },
    { gx: 25, gy: 10, value: 2, width: 1, height: 1, axis: 'x' },
    { gx: 16, gy: 20, value: 5, width: 3, height: 1, axis: 'x' },
    { gx: 28, gy: 12, value: 7, width: 1, height: 3, axis: 'y' },
    { gx: 7, gy: 19, value: 6, width: 1, height: 2, axis: 'y' },
    { gx: 7, gy: 6, value: 1, width: 1, height: 2, axis: 'y' },
    { gx: 20, gy: 19, value: 1, width: 1, height: 1, axis: 'x' },
    { gx: 22, gy: 4, value: 2, width: 3, height: 1, axis: 'x' },
    { gx: 30, gy: 6, value: 3, width: 1, height: 2, axis: 'y' },
    { gx: 2, gy: 5, value: 4, width: 2, height: 2, axis: 'y' },
    { gx: 15, gy: 1, value: 5, width: 3, height: 1, axis: 'x' },
    { gx: 32, gy: 15, value: 7, width: 2, height: 2, axis: 'y' },
    { gx: 9, gy: 24, value: 8, width: 3, height: 1, axis: 'x' },
    { gx: 25, gy: 23, value: 9, width: 2, height: 2, axis: 'x' },
  ]
  for (const [i, site] of sites.entries()) {
    const hash = Math.imul(seed + i, 0x4_5d_9f_3b) >>> 0
    const jitter = ((hash >>> 19) % 3) - 1
    const left = site.gx + (site.axis === 'x' ? jitter : 0)
    const top = site.gy + (site.axis === 'y' ? jitter : 0)
    for (let y = 0; y < site.height; y++) {
      for (let x = 0; x < site.width; x++) {
        const cell = { gx: left + x, gy: top + y }
        cells[key(cell)] = { ...cell, value: site.value }
      }
    }
  }
  for (const [prior, ring] of [
    [0, 1],
    [1, 2],
    [2, 3],
  ] as const) {
    const cluster = Arr.filter(Rec.values(cells), (c) => inBounds(c, ring) && !inBounds(c, prior))
    let added = 0
    for (const source of cluster) {
      if (added >= richness) {
        break
      }
      for (const dir of ['N', 'E', 'S', 'W'] as const) {
        const cell = neighbor(dir)(source)
        if (cells[key(cell)] === undefined && inBounds(cell, ring) && !inBounds(cell, prior)) {
          cells[key(cell)] = { ...cell, value: source.value }
          added++
          break
        }
      }
    }
  }
  return cells
}
export const setup = (seed: number) =>
  System(
    'Beltworks/Generate',
    {
      commands: System.commands(System.spawns(GridCell, Facing, Building, ResourceVein)),
      resources: { index: System.writeResource(GridIndex), progress: System.writeResource(Progression) },
    },
    ({ commands, resources }) => {
      resources.progress.set({ ...initial, meta: { ...initial.meta, seed } })
      const buildings: Record<string, number> = {}
      const deposits: Record<string, number> = {}
      for (const gx of [17, 18]) {
        for (const gy of [12, 13]) {
          buildings[key({ gx, gy })] = commands.spawn(buildingDraft({ gx, gy }, 'N', { kind: 'hub' }))
        }
      }
      for (const [k, { gx, gy, value }] of Rec.toEntries(veinLayout(seed, 0))) {
        deposits[k] = commands.spawn(Game.Command.spawn([GridCell, { gx, gy }], [ResourceVein, { value }]))
      }
      resources.index.set({ buildings, veins: deposits, items: {} })
    }
  )
type Placement = Extract<Command, { type: 'placeBuilding' }>
const newBuilding = (cmd: Placement, p: typeof initial): BuildingState => {
  switch (cmd.kind) {
    case 'combiner':
      return {
        kind: cmd.kind,
        op: cmd.op,
        slotA: Option.none<number>(),
        slotB: Option.none<number>(),
        remainingTicks: 0,
      }
    case 'beacon':
      return { kind: cmd.kind, fuelTicks: 0 }
    case 'filter':
      return { kind: cmd.kind, targetValue: cmd.targetValue ?? milestoneFor(p).requirements[0]?.value ?? 1 }
    case 'buffer':
      return { kind: cmd.kind, storedValue: Option.none<number>(), count: 0 }
    case 'splitter':
      return { kind: cmd.kind, nextPort: 0 }
    case 'extractor':
      return { kind: cmd.kind, remainingTicks: 0, surgeCount: 0, bonusPending: false }
    default:
      return { kind: cmd.kind }
  }
}
export const processCommands = System(
  'Beltworks/ProcessCommands',
  {
    queries: { structures, cargo, veins },
    resources: {
      index: System.writeResource(GridIndex),
      progress: System.writeResource(Progression),
      queue: System.writeResource(CommandQueue),
    },
    commands: System.commands(
      System.spawns(GridCell, Building, Facing, ResourceVein),
      System.despawns(Building, Item, ResourceVein)
    ),
    events: { reject: System.writeEvent(CommandRejected), medal: System.writeEvent(MedalUnlocked) },
  },
  ({ commands, queries, resources, events }) => {
    const queue = resources.queue.get()
    if (queue.length === 0) {
      return
    }
    const current = resources.index.get()
    let newVeins = Option.none<ReturnType<typeof veinLayout>>()
    const buildings = { ...current.buildings }
    const items = { ...current.items }
    const { data } = queries.structures
    const existing = Rec.fromEntries(Arr.map(queries.structures.each(), (e) => [key(data.cell.get(e)), e]))
    const held = Rec.fromEntries(Arr.map(queries.cargo.each(), (e) => [key(queries.cargo.data.tile.get(e)), e]))
    const pending: Record<string, { cell: Cell; dir: Direction; state: BuildingState }> = {}
    const reject = (reason: string) => events.reject.emit({ reason })
    let demolished = false
    const remove = (k: string) => {
      const e = existing[k]
      if (e !== undefined) {
        demolished = true
        commands.despawn(e)
      }
      delete existing[k]
      delete pending[k]
      delete buildings[k]
      const item = held[k]
      if (item !== undefined) {
        commands.despawn(item)
      }
      delete held[k]
      delete items[k]
    }
    const place = (cmd: Placement) => {
      const p = resources.progress.get()
      const k = key(cmd)
      if (!inBounds(cmd, p.boardTier)) {
        return 'Expand workshop to build here'
      }
      if (
        pending[k] !== undefined ||
        existing[k] !== undefined ||
        !Number.isInteger(cmd.gx) ||
        !Number.isInteger(cmd.gy)
      ) {
        return 'Cell unavailable'
      }
      if (cmd.kind === 'extractor' && (Option.getOrUndefined(newVeins) ?? current.veins)[k] === undefined) {
        return 'Extractor requires a vein'
      }
      const unlock = toolUnlock[cmd.kind === 'combiner' ? cmd.op : cmd.kind]
      if (p.milestoneIndex < unlock) {
        return 'Building locked'
      }
      pending[k] = { cell: cmd, dir: cmd.dir, state: newBuilding(cmd, p) }

      return undefined
    }
    for (const cmd of queue) {
      const p = resources.progress.get()
      if (cmd.type === 'expandBoard') {
        const cost = expansionCost(p.boardTier)
        if (p.milestoneIndex < expansionUnlock(p.boardTier) || !canAfford(p, cost)) {
          reject('Expansion unavailable')
        } else {
          resources.progress.set({ ...pay({ p, cost }), boardTier: ([1, 2, 3, 3] as const)[p.boardTier] })
        }
        continue
      }
      if (cmd.type === 'buyUpgrade') {
        const tier = p.upgrades[cmd.upgrade]
        const cost = upgradeCost(tier)
        if (p.milestoneIndex < upgradeUnlock(cmd.upgrade) || tier >= upgradeLimit(cmd.upgrade) || !canAfford(p, cost)) {
          reject('Upgrade unavailable')
        } else {
          resources.progress.set({
            ...pay({ p, cost }),
            upgrades: { ...p.upgrades, [cmd.upgrade]: tier + 1 },
          })
        }
        continue
      }
      if (cmd.type === 'buyMetaUpgrade') {
        const ranks = p.meta.metaUpgrades
        const rank = ranks[cmd.upgrade]
        const cost = metaUpgradeCost(cmd.upgrade, rank)
        if (rank >= metaUpgradeLimits[cmd.upgrade] || p.meta.cores < cost) {
          reject('Core upgrade unavailable')
        } else {
          resources.progress.set({
            ...p,
            meta: { ...p.meta, cores: p.meta.cores - cost, metaUpgrades: { ...ranks, [cmd.upgrade]: rank + 1 } },
          })
        }
        continue
      }
      if (cmd.type === 'ascendBoard' && p.milestoneIndex < 8) {
        reject('Ascension requires milestone 8')
        continue
      }
      if (
        cmd.type === 'ascendBoard' ||
        cmd.type === 'resetBoard' ||
        cmd.type === 'clearFloor' ||
        cmd.type === 'removeArea'
      ) {
        const selected = ({ gx, gy }: Cell) =>
          cmd.type !== 'removeArea' || (gx >= cmd.minX && gx <= cmd.maxX && gy >= cmd.minY && gy <= cmd.maxY)
        for (const [k, e] of Rec.toEntries(existing)) {
          if (data.building.get(e).kind !== 'hub' && selected(data.cell.get(e))) {
            remove(k)
          }
        }
        for (const [k, staged] of Rec.toEntries(pending)) {
          if (selected(staged.cell)) {
            remove(k)
          }
        }
        if (cmd.type === 'resetBoard') {
          const seed = p.meta.seed - p.meta.ascensions
          resources.progress.set({ ...initial, meta: { ...initial.meta, seed } })
          if (p.meta.ascensions > 0) {
            newVeins = Option.some(veinLayout(seed, 0))
          }
        } else if (cmd.type === 'ascendBoard') {
          const award = coresEarned(p.milestoneIndex, p.meta.mutator)
          const seed = p.meta.seed + 1
          const { bootstrap, veinRichness } = p.meta.metaUpgrades
          resources.progress.set({
            ...initial,
            sparks: 50 * bootstrap,
            upgrades: { ...initial.upgrades, beltSpeed: 1 + bootstrap, extractorSpeed: 1 + bootstrap },
            meta: {
              ...p.meta,
              seed,
              ascensions: p.meta.ascensions + 1,
              cores: p.meta.cores + award,
              totalCoresEarned: p.meta.totalCoresEarned + award,
              mutator: cmd.mutator,
            },
          })
          unlock({ resources, events }, 'ascended')
          if (p.meta.mutator !== 'standard') {
            unlock({ resources, events }, 'primeEngineer')
          }
          newVeins = Option.some(veinLayout(seed, veinRichness))
        }
        continue
      }
      const k = key(cmd)
      const e = existing[k]
      const staged = pending[k]
      if (cmd.type === 'placeBuilding') {
        const reason = place(cmd)
        if (reason !== undefined) {
          reject(reason)
        }
      } else if (
        (e === undefined && staged === undefined) ||
        (e !== undefined && data.building.get(e).kind === 'hub')
      ) {
        reject('Building unavailable')
      } else if (cmd.type === 'setFilter') {
        const state = staged?.state ?? (e === undefined ? undefined : data.building.get(e))
        if (state?.kind !== 'filter') {
          reject('Filter unavailable')
        } else if (staged !== undefined) {
          staged.state = { ...state, targetValue: cmd.targetValue }
        } else if (e !== undefined) {
          data.building.set(e, { ...state, targetValue: cmd.targetValue })
        }
      } else if (cmd.type === 'removeBuilding') {
        remove(k)
      } else if (staged !== undefined) {
        pending[k] = { ...staged, dir: clockwise[staged.dir] }
      } else if (e !== undefined) {
        data.facing.set(e, { dir: clockwise[data.facing.get(e).dir] })
      }
    }
    for (const [k, v] of Rec.toEntries(pending)) {
      buildings[k] = commands.spawn(buildingDraft(v.cell, v.dir, v.state))
    }
    const progress = resources.progress.get()
    const lastDelivery = progress.deliveryWindow.at(-1)
    if (
      demolished &&
      progress.milestoneIndex >= 6 &&
      lastDelivery !== undefined &&
      Arr.some(milestoneFor(progress).requirements, (r) => (progress.rateByValue[r.value] ?? 0) > 0)
    ) {
      resources.progress.set({ ...progress, missionRateStart: lastDelivery.tick + 1 })
    }
    let deposits = current.veins
    if (Option.isSome(newVeins)) {
      for (const e of queries.veins.each()) {
        commands.despawn(e)
      }
      deposits = Rec.map(newVeins.value, ({ gx, gy, value }) =>
        commands.spawn(Game.Command.spawn([GridCell, { gx, gy }], [ResourceVein, { value }]))
      )
    }
    resources.index.set({ veins: deposits, buildings, items })
    resources.queue.set([])
  }
)

const cellCount = rows * columns
const cellIndex = ({ gx, gy }: Cell) => (gx < 0 || gx >= columns ? -1 : gy * columns + gx)
const cellKeys = Arr.makeBy(cellCount, (i) => key({ gx: i % columns, gy: Math.floor(i / columns) }))
type MachineEntity = ReturnType<TransportContext['queries']['structures']['each']>[number]

type Layout = {
  buildings: Readonly<Record<string, number>>
  occupants: Uint16Array
  order: Uint16Array
  occupied: Uint8Array
  visited: Uint8Array
  processed: Uint8Array
  coverage: Uint8Array
  byCell: Array<MachineEntity>
  producers: Array<MachineEntity>
  combiners: Array<MachineEntity>
  beacons: Array<MachineEntity>
}
// A query returns a new member list after a structural change. Edits also replace the saved building index.
const layouts = new WeakMap<ReadonlyArray<MachineEntity>, Layout>()
function layout(structuresQuery: TransportContext['queries']['structures'], buildings: Layout['buildings']) {
  const members = structuresQuery.each()
  const cached = layouts.get(members)
  if (cached?.buildings === buildings) {
    return cached
  }
  const byCell: Array<MachineEntity> = []
  const producers: Array<MachineEntity> = []
  const combiners: Array<MachineEntity> = []
  const beacons: Array<MachineEntity> = []
  const machines = structuresQuery.data
  for (const e of members) {
    byCell[cellIndex(machines.cell.get(e))] = e
    const kind = machines.building.get(e).kind
    if (kind === 'extractor' || kind === 'buffer') {
      producers.push(e)
    } else if (kind === 'combiner') {
      combiners.push(e)
    } else if (kind === 'beacon') {
      beacons.push(e)
    }
  }
  const next = {
    buildings,
    byCell,
    producers,
    combiners,
    beacons,
    occupants: new Uint16Array(cellCount),
    order: new Uint16Array(cellCount),
    occupied: new Uint8Array(cellCount),
    visited: new Uint8Array(cellCount),
    processed: new Uint8Array(cellCount),
    coverage: new Uint8Array(cellCount),
  }
  layouts.set(members, next)
  return next
}

const nextInput = [1, 2, 0] as const
function destinations(
  { queries, resources, events }: TransportContext,
  byCell: Array<MachineEntity>,
  occupied: (cell: Cell) => boolean,
  clearTile: (cell: Cell) => void,
  tryInput: (cell: Cell, travel: Direction) => void
) {
  const { structures: machines } = queries
  const { data } = machines
  const accept = (
    cell: Cell,
    travel: Direction,
    value: number,
    move: (cell: Cell, from: Direction) => void,
    underground = false
  ) => {
    const target = byCell[cellIndex(cell)]
    if (target === undefined) {
      return false
    }
    const b = data.building.get(target)
    const facing = data.facing.get(target).dir
    switch (b.kind) {
      case 'tunnelOut':
        if (underground && !occupied(cell)) {
          unlock({ resources, events }, 'underground')
          move(cell, opposite[facing])
          return true
        }
        return false
      case 'extractor':
        return false
      case 'hub': {
        const p = resources.progress.get()
        const { next, matchedTarget, sparksEarned, complete, bonusSparks } = deliver({
          previous: p,
          value,
          tick: resources.time.get().step,
        })
        resources.progress.set(next)
        if (next.contractIndex >= 3) {
          unlock({ resources, events }, 'contractRunner')
        }
        if (complete && p.milestoneIndex === 0) {
          unlock({ resources, events }, 'firstDelivery')
        }
        if (
          !p.meta.medals.includes('multiLine') &&
          Arr.filter(Rec.values(next.rateByValue), (rate) => rate >= 10).length >= 3
        ) {
          unlock({ resources, events }, 'multiLine')
        }
        if (
          matchedTarget &&
          !p.meta.medals.includes('throughputTitan') &&
          Arr.reduce(milestoneFor(p).requirements, 0, (sum, r) => sum + missionRate({ p: next, value: r.value })) >= 150
        ) {
          unlock({ resources, events }, 'throughputTitan')
        }
        events.delivery.emit({ ...cell, value, intakeSide: opposite[travel], matchedTarget, sparksEarned })
        if (complete) {
          events.complete.emit({ milestoneIndex: p.milestoneIndex, targetValue: value, bonusSparks })
        }
        return true
      }
      case 'buffer':
        if (
          travel === opposite[facing] ||
          b.count === BUFFER_CAPACITY ||
          (Option.isSome(b.storedValue) && b.storedValue.value !== value)
        ) {
          return false
        }
        data.building.set(target, { ...b, count: b.count + 1, storedValue: Option.some(value) })
        return true
      case 'belt': {
        clearTile(cell)
        if (travel === opposite[facing] || occupied(cell)) {
          return false
        }
        const inputs = [counterClockwise[facing], opposite[facing], clockwise[facing]] as const
        let port = b.nextInput ?? 0
        while (inputs[port] !== opposite[travel]) {
          const side = inputs[port]
          tryInput(neighbor(side)(cell), opposite[side])
          if (occupied(cell)) {
            return false
          }
          port = nextInput[port]
        }
        move(cell, opposite[travel])
        if (b.nextInput !== nextInput[port]) {
          data.building.set(target, { ...b, nextInput: nextInput[port] })
        }
        return true
      }
      case 'beacon':
        if (value < 2) {
          return false
        }
        data.building.set(target, {
          ...b,
          fuelTicks: Math.min(
            1800,
            b.fuelTicks + value * (resources.progress.get().meta.metaUpgrades.beaconResonance >= 3 ? 90 : 45)
          ),
        })
        return true
      case 'trash':
        return true
      case 'combiner': {
        const from = opposite[travel]
        const slot = from === counterClockwise[facing] ? 'slotA' : from === clockwise[facing] ? 'slotB' : undefined
        if (slot === undefined || Option.isSome(b[slot])) {
          return false
        }
        data.building.set(target, { ...b, [slot]: Option.some(value) })
        return true
      }
      default:
        if ((b.kind === 'filter' && travel !== facing) || travel === opposite[facing] || occupied(cell)) {
          return false
        }
        move(cell, opposite[travel])
        return true
    }
  }
  const at: BuildingAt = (cell) => {
    const machine = byCell[cellIndex(cell)]
    return machine === undefined
      ? Option.none()
      : Option.some({ kind: data.building.get(machine).kind, dir: data.facing.get(machine).dir })
  }
  return { accept, at }
}
function output(
  ctx: TransportContext,
  accept: ReturnType<typeof destinations>['accept'],
  setOccupant: (cell: Cell, id: number) => void
) {
  const { commands } = ctx
  return (cell: Cell, dir: Direction, value: number) =>
    accept(neighbor(dir)(cell), dir, value, (tile, fromDir) => {
      const delta = offsets[fromDir]
      const id = commands.spawn(
        Game.Command.spawn(
          [Item, { value }],
          [OnTile, { ...tile, fromDir, progress: 0, prevProgress: 0 }],
          [WorldPosition, { x: tile.gx + 0.5 + delta.gx / 2, y: tile.gy + 0.5 + delta.gy / 2 }]
        )
      )
      setOccupant(tile, id)
    })
}
const veinValues = new WeakMap<ReturnType<TransportContext['queries']['veins']['each']>, Array<number>>()
function depositsByCell(query: TransportContext['queries']['veins']) {
  const members = query.each()
  const cached = veinValues.get(members)
  if (cached !== undefined) {
    return cached
  }
  const values: Array<number> = []
  for (const e of members) {
    values[cellIndex(query.data.cell.get(e))] = query.data.vein.get(e).value
  }
  veinValues.set(members, values)
  return values
}
function productionTurns(
  ctx: TransportContext,
  accept: ReturnType<typeof destinations>['accept'],
  setOccupant: (cell: Cell, id: number) => void,
  clearTile: (cell: Cell) => void,
  grid: Layout,
  bufferInterval: number
) {
  const { queries, resources } = ctx
  const emit = output(ctx, accept, setOccupant)
  const { data } = queries.structures
  const values = depositsByCell(queries.veins)
  const resonance = resources.progress.get().meta.metaUpgrades.beaconResonance
  const radius = resonance >= 2 ? 3 : 2
  const coverage = grid.coverage.fill(0)
  for (const e of grid.beacons) {
    const b = data.building.get(e)
    if (b.kind !== 'beacon' || b.fuelTicks === 0) {
      continue
    }
    data.building.set(e, { ...b, fuelTicks: b.fuelTicks - 1 })
    const cell = data.cell.get(e)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const k = cellIndex({ gx: cell.gx + dx, gy: cell.gy + dy })
        coverage[k] = Math.min(resonance >= 1 ? 3 : 2, (coverage[k] ?? 0) + 1)
      }
    }
  }
  const processed = grid.processed.fill(0)
  return (e: MachineEntity) => {
    const b = data.building.get(e)
    const cell = data.cell.get(e)
    const slot = cellIndex(cell)
    if (processed[slot] === 1) {
      return
    }
    processed[slot] = 1
    if (b.kind === 'buffer') {
      const previousDelay = b.cooldownTicks ?? 0
      const delay = previousDelay - 1
      if (previousDelay > 0) {
        data.building.set(e, { ...b, cooldownTicks: Math.max(0, delay) })
      }
      if (delay > 0 || Option.isNone(b.storedValue)) {
        return
      }
      const dir = data.facing.get(e).dir
      clearTile(neighbor(dir)(cell))
      if (emit(cell, dir, b.storedValue.value)) {
        const current = data.building.get(e)
        if (current.kind === 'buffer') {
          data.building.set(e, {
            ...current,
            cooldownTicks: bufferInterval,
            count: current.count - 1,
            storedValue: current.count === 1 ? Option.none<number>() : current.storedValue,
          })
        }
      }
      return
    }
    if (b.kind === 'extractor') {
      const value = values[slot]
      const p = resources.progress.get()
      const remainingTicks = b.remainingTicks - (1 + 0.5 * (coverage[slot] ?? 0))
      const send = () => {
        if (value === undefined || !emit(cell, data.facing.get(e).dir, value)) {
          return false
        }
        if ((coverage[slot] ?? 0) >= 2) {
          unlock(ctx, 'overclocked')
        }
        return true
      }
      if (b.bonusPending) {
        data.building.set(e, { ...b, remainingTicks: Math.max(0, remainingTicks), bonusPending: !send() })
      } else if (remainingTicks <= 0 && send()) {
        const surgeCount = p.upgrades.surge > 1 ? b.surgeCount + 1 : 0
        const bonusPending = surgeCount >= surgeInterval(p.upgrades.surge)
        data.building.set(e, {
          ...b,
          surgeCount: bonusPending ? 0 : surgeCount,
          bonusPending,
          remainingTicks:
            extractorPeriod(p.upgrades.extractorSpeed) / productionSpeed(p) +
            (b.remainingTicks > 0 ? remainingTicks : 0),
        })
      } else {
        data.building.set(e, { ...b, remainingTicks: Math.max(0, remainingTicks) })
      }
      return
    }
    if (b.kind !== 'combiner' || Option.isNone(b.slotA) || Option.isNone(b.slotB)) {
      return
    }
    const p = ctx.resources.progress.get()
    const period = Math.max(1, craftPeriod(p.upgrades.combinerSpeed) / productionSpeed(p))
    const remainingTicks =
      (b.remainingTicks <= 0 ? period + b.remainingTicks : b.remainingTicks) - (1 + 0.5 * (coverage[slot] ?? 0))
    if (remainingTicks > 0) {
      data.building.set(e, { ...b, remainingTicks })
      return
    }
    const a = b.slotA.value
    const second = b.slotB.value
    const result = Math.min(
      Number.MAX_SAFE_INTEGER,
      {
        add: a + second,
        sub: Math.max(0, a - second),
        mul: a * second,
        div: second === 0 ? 0 : Math.floor(a / second),
      }[b.op]
    )
    if (emit(cell, data.facing.get(e).dir, result)) {
      data.building.set(e, { ...b, slotA: Option.none<number>(), slotB: Option.none<number>(), remainingTicks })
      if ((coverage[slot] ?? 0) >= 2) {
        unlock(ctx, 'overclocked')
      }
      const firstTarget =
        !p.craftedTargets.includes(result) &&
        ((result === 3 && b.op === 'add') ||
          Arr.some(milestoneFor(p).requirements, (requirement) => requirement.value === result))
      if (firstTarget) {
        const current = ctx.resources.progress.get()
        ctx.resources.progress.set({ ...current, craftedTargets: [...current.craftedTargets, result] })
      }
      ctx.events.craft.emit({ ...cell, op: b.op, a, b: second, result, firstTarget })
    } else {
      data.building.set(e, { ...b, remainingTicks: 1 })
    }
  }
}
export const transport = System('Beltworks/AdvanceBelts', production, (ctx) => {
  const { resources, queries, commands } = ctx
  const index = resources.index.get()
  let changes = Option.none<Record<string, number>>()
  const editItems = () => {
    if (Option.isSome(changes)) {
      return changes.value
    }
    const items: Record<string, number> = {}
    for (const k of Rec.keys(index.items)) {
      const id = index.items[k]
      if (id !== undefined) {
        items[k] = id
      }
    }
    changes = Option.some(items)
    return items
  }
  const grid = layout(queries.structures, index.buildings)
  const { byCell, producers, combiners } = grid
  const occupied = grid.occupied.fill(0)
  const visited = grid.visited.fill(0)
  const setOccupant = (cell: Cell, id: number) => {
    const slot = cellIndex(cell)
    occupied[slot] = 1
    const k = cellKeys[slot]
    if (k !== undefined) {
      editItems()[k] = id
    }
  }
  const machines = queries.structures.data
  const before = resources.progress.get()
  resources.progress.set({ ...before, runTicks: before.runTicks + 1 })
  const { data } = queries.cargo
  const cargo = queries.cargo.each()
  const occupants = grid.occupants.fill(0)
  const { order } = grid
  for (let i = 0; i < cargo.length; i++) {
    const e = cargo[i]
    if (e !== undefined) {
      const k = cellIndex(data.tile.get(e))
      occupied[k] = 1
      occupants[k] = i + 1
      order[i] = k
    }
  }
  const clearTile = (cell: Cell) => {
    const k = cellIndex(cell)
    const item = cargo[(occupants[k] ?? 0) - 1]
    if (item !== undefined && visited[k] !== 1) {
      advance(item, k)
    }
  }
  const { accept, at } = destinations(
    ctx,
    byCell,
    (cell) => occupied[cellIndex(cell)] === 1,
    clearTile,
    (cell, travel) => {
      const k = cellIndex(cell)
      const machine = byCell[k]
      if (machine === undefined) {
        return
      }
      const dir = machines.facing.get(machine).dir
      if (dir === travel) {
        produce(machine)
      }
      const item = cargo[(occupants[k] ?? 0) - 1]
      const source = machines.building.get(machine)
      if (
        item !== undefined &&
        visited[k] !== 1 &&
        source.kind !== 'tunnelIn' &&
        Arr.contains(outputDirections({ state: source, dir, value: data.item.get(item).value }), travel)
      ) {
        advance(item, k)
      }
    }
  )
  const p = resources.progress.get()
  const speed = Math.min(TILE_PROGRESS_MAX, beltRate(p.upgrades.beltSpeed) * productionSpeed(p))
  const produce = productionTurns(
    ctx,
    accept,
    setOccupant,
    clearTile,
    grid,
    Math.max(1, Math.ceil(TILE_PROGRESS_MAX / beltRate(p.upgrades.beltSpeed)))
  )
  // Free the downstream cell first. Each item gets one turn, including in a cycle.
  const advance = (e: (typeof cargo)[number], k: number) => {
    if (visited[k] === 1) {
      return
    }
    visited[k] = 1
    const tile = data.tile.get(e)
    const machine = byCell[k]
    if (machine === undefined) {
      return
    }
    const progress = Math.min(TILE_PROGRESS_MAX, tile.progress + speed)
    const overflow = tile.progress === TILE_PROGRESS_MAX ? 0 : Math.max(0, tile.progress + speed - TILE_PROGRESS_MAX)
    if (progress !== tile.progress || progress !== tile.prevProgress) {
      data.tile.set(e, { gx: tile.gx, gy: tile.gy, fromDir: tile.fromDir, progress, prevProgress: tile.progress })
    }
    if (progress < TILE_PROGRESS_MAX) {
      return
    }
    const state = machines.building.get(machine)
    const dir = machines.facing.get(machine).dir
    const value = data.item.get(e).value
    for (const output of outputDirections({ state, dir, value })) {
      const underground = state.kind === 'tunnelIn'
      const dest = underground ? findTunnelPartner({ cell: tile, facing: output, at }) : neighbor(output)(tile)
      if (dest === undefined) {
        continue
      }
      clearTile(dest)
      let moved = false
      const accepted = accept(
        dest,
        output,
        value,
        (cell, fromDir) => {
          moved = true
          data.tile.set(e, { gx: cell.gx, gy: cell.gy, fromDir, prevProgress: 0, progress: overflow })
        },
        underground
      )
      if (!accepted) {
        continue
      }
      const updated = editItems()
      const oldKey = cellKeys[k]
      if (oldKey !== undefined) {
        delete updated[oldKey]
      }
      occupied[k] = 0
      if (moved) {
        setOccupant(dest, e.id)
      } else {
        commands.despawn(e)
      }

      if (state.kind === 'splitter') {
        machines.building.set(machine, {
          ...state,
          nextPort: output === counterClockwise[dir] ? 1 : 0,
        })
      }
      break
    }
  }
  for (const e of producers) {
    produce(e)
  }
  for (const e of combiners) {
    produce(e)
  }
  for (const [i, e] of cargo.entries()) {
    const k = order[i]
    if (k !== undefined) {
      advance(e, k)
    }
  }
  if (Option.isSome(changes)) {
    resources.index.set({ ...index, items: changes.value })
  }
})
export const positions = System(
  'Beltworks/UpdateWorldPositions',
  {
    queries: { structures, cargo },
    resources: {
      index: System.readResource(GridIndex),
      progress: System.writeResource(Progression),
      time: System.readResource(Time),
    },
  },
  ({ queries, resources }) => {
    const { byCell } = layout(queries.structures, resources.index.get().buildings)
    const machines = queries.structures.data
    const { data } = queries.cargo
    for (const e of queries.cargo.each()) {
      const tile = data.tile.get(e)
      const f = tile.progress / TILE_PROGRESS_MAX
      const entry = offsets[tile.fromDir]
      const machine = byCell[cellIndex(tile)]
      const exit =
        offsets[
          machine === undefined
            ? 'N'
            : outputDirections({
                state: machines.building.get(machine),
                dir: machines.facing.get(machine).dir,
                value: data.item.get(e).value,
              })[0]
        ]
      const start = 0.5 * (1 - f) ** 2
      const end = 0.5 * f ** 2
      const x = tile.gx + 0.5 + entry.gx * start + exit.gx * end
      const y = tile.gy + 0.5 + entry.gy * start + exit.gy * end
      if (tile.progress === TILE_PROGRESS_MAX && tile.prevProgress === TILE_PROGRESS_MAX) {
        const previous = data.position.get(e)
        if (previous.x === x && previous.y === y) {
          continue
        }
      }
      data.position.set(e, { x, y })
    }
    const p = resources.progress.get()
    const current = expireDeliveries({ p, tick: resources.time.get().step })
    if (current !== p) {
      resources.progress.set(current)
    }
  }
)
