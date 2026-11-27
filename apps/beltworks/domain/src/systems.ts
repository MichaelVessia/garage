import * as Arr from 'effect/Array'
import * as Visited from 'effect/MutableHashSet'
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
    case 'merger':
      return { kind: cmd.kind, nextInput: 0 }
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
      if (cmd.type === 'stampBlueprint') {
        let placed = 0
        for (const entry of cmd.entries) {
          if (
            place({ ...entry, type: 'placeBuilding', gx: cmd.originX + entry.dx, gy: cmd.originY + entry.dy }) ===
            undefined
          ) {
            placed++
          }
        }
        if (placed >= 6) {
          unlock({ resources, events }, 'blueprintArchitect')
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

const nextInput = [1, 2, 0] as const
function destinations(
  { queries, resources, events }: TransportContext,
  clearTile: (cell: Cell) => void,
  tryInput: (cell: Cell, travel: Direction) => void
) {
  const { structures: machines } = queries
  const { data } = machines
  const byCell = Rec.fromEntries(Arr.map(machines.each(), (e) => [key(data.cell.get(e)), e]))
  const accept = (
    cell: Cell,
    travel: Direction,
    value: number,
    move: (cell: Cell, from: Direction) => void,
    underground = false
  ) => {
    const k = key(cell)
    const target = byCell[k]
    if (target === undefined) {
      return false
    }
    const b = data.building.get(target)
    const facing = data.facing.get(target).dir
    const p = resources.progress.get()
    switch (b.kind) {
      case 'tunnelOut':
        if (underground && resources.index.get().items[k] === undefined) {
          unlock({ resources, events }, 'underground')
          move(cell, opposite[facing])
          return true
        }
        return false
      case 'extractor':
        return false
      case 'hub': {
        const { next, matchedTarget, sparksEarned, complete } = deliver({
          previous: p,
          value,
          tick: resources.time.get().step,
        })
        resources.progress.set(next)
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
        events.delivery.emit({ ...cell, value, matchedTarget, sparksEarned })
        if (complete) {
          events.complete.emit({ milestoneIndex: p.milestoneIndex, targetValue: value })
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
      case 'merger': {
        clearTile(cell)
        if (travel === opposite[facing] || resources.index.get().items[k] !== undefined) {
          return false
        }
        const inputs = [counterClockwise[facing], opposite[facing], clockwise[facing]] as const
        let port = b.nextInput
        while (inputs[port] !== opposite[travel]) {
          const side = inputs[port]
          tryInput(neighbor(side)(cell), opposite[side])
          if (resources.index.get().items[k] !== undefined) {
            return false
          }
          port = nextInput[port]
        }
        move(cell, opposite[travel])
        data.building.set(target, { ...b, nextInput: nextInput[port] })
        return true
      }
      case 'beacon':
        if (value < 2) {
          return false
        }
        data.building.set(target, {
          ...b,
          fuelTicks: Math.min(1800, b.fuelTicks + value * (p.meta.metaUpgrades.beaconResonance >= 3 ? 90 : 45)),
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
        if (
          (b.kind === 'filter' && travel !== facing) ||
          travel === opposite[facing] ||
          resources.index.get().items[k] !== undefined
        ) {
          return false
        }
        move(cell, opposite[travel])
        return true
    }
  }
  const at: BuildingAt = (cell) => {
    const machine = byCell[key(cell)]
    return machine === undefined
      ? Option.none()
      : Option.some({ kind: data.building.get(machine).kind, dir: data.facing.get(machine).dir })
  }
  return { accept, byCell, at }
}
function output(ctx: TransportContext, accept: ReturnType<typeof destinations>['accept']) {
  const { commands, resources } = ctx
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
      const index = resources.index.get()
      resources.index.set({ ...index, items: { ...index.items, [key(tile)]: id } })
    })
}
function productionTurns(
  ctx: TransportContext,
  accept: ReturnType<typeof destinations>['accept'],
  clearTile: (cell: Cell) => void,
  bufferInterval: number
) {
  const { queries, resources } = ctx
  const emit = output(ctx, accept)
  const { data } = queries.structures
  const values = Rec.fromEntries(
    Arr.map(queries.veins.each(), (e) => [key(queries.veins.data.cell.get(e)), queries.veins.data.vein.get(e).value])
  )
  const resonance = resources.progress.get().meta.metaUpgrades.beaconResonance
  const radius = resonance >= 2 ? 3 : 2
  const coverage: Record<string, number> = {}
  for (const e of queries.structures.each()) {
    const b = data.building.get(e)
    if (b.kind !== 'beacon' || b.fuelTicks === 0) {
      continue
    }
    data.building.set(e, { ...b, fuelTicks: b.fuelTicks - 1 })
    const cell = data.cell.get(e)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const k = key({ gx: cell.gx + dx, gy: cell.gy + dy })
        coverage[k] = Math.min(resonance >= 1 ? 3 : 2, (coverage[k] ?? 0) + 1)
      }
    }
  }
  type Machine = ReturnType<typeof queries.structures.each>[number]
  const processed = Visited.empty<number>()
  return (e: Machine) => {
    if (Visited.has(processed, e.id)) {
      return
    }
    Visited.add(processed, e.id)
    const b = data.building.get(e)
    if (b.kind === 'buffer') {
      const previousDelay = b.cooldownTicks ?? 0
      const delay = previousDelay - 1
      if (previousDelay > 0) {
        data.building.set(e, { ...b, cooldownTicks: Math.max(0, delay) })
      }
      if (delay > 0 || Option.isNone(b.storedValue)) {
        return
      }
      const cell = data.cell.get(e)
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
      const cell = data.cell.get(e)
      const value = values[key(cell)]
      const p = resources.progress.get()
      const remainingTicks = b.remainingTicks - (1 + 0.5 * (coverage[key(cell)] ?? 0))
      const send = () => {
        if (value === undefined || !emit(cell, data.facing.get(e).dir, value)) {
          return false
        }
        if ((coverage[key(cell)] ?? 0) >= 2) {
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
    const cell = data.cell.get(e)
    const remainingTicks =
      (b.remainingTicks <= 0 ? period + b.remainingTicks : b.remainingTicks) - (1 + 0.5 * (coverage[key(cell)] ?? 0))
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
      if ((coverage[key(cell)] ?? 0) >= 2) {
        unlock(ctx, 'overclocked')
      }
      ctx.events.craft.emit({ ...cell, op: b.op, a, b: second, result })
    } else {
      data.building.set(e, { ...b, remainingTicks: 1 })
    }
  }
}
function outputDirections(
  state: BuildingState,
  dir: Direction,
  value: number
): readonly [Direction, ...Array<Direction>] {
  if (state.kind === 'splitter' && state.nextPort === 0) {
    return [counterClockwise[dir], clockwise[dir]]
  }
  if (state.kind === 'splitter' || (state.kind === 'filter' && state.targetValue !== value)) {
    return [clockwise[dir], counterClockwise[dir]]
  }
  return [dir]
}
export const transport = System('Beltworks/AdvanceBelts', production, (ctx) => {
  const { resources, queries, commands } = ctx
  const { data } = queries.cargo
  const occupants = Rec.fromEntries(Arr.map(queries.cargo.each(), (e) => [key(data.tile.get(e)), e]))
  const clearTile = (cell: Cell) => {
    const item = occupants[key(cell)]
    if (item !== undefined) {
      advance(item)
    }
  }
  const { accept, byCell, at } = destinations(ctx, clearTile, (cell, travel) => {
    const k = key(cell)
    const machine = byCell[k]
    if (machine === undefined) {
      return
    }
    const dir = queries.structures.data.facing.get(machine).dir
    if (dir === travel) {
      produce(machine)
    }
    const item = occupants[k]
    const source = queries.structures.data.building.get(machine)
    if (
      item !== undefined &&
      source.kind !== 'tunnelIn' &&
      Arr.contains(outputDirections(source, dir, data.item.get(item).value), travel)
    ) {
      advance(item)
    }
  })
  const p = resources.progress.get()
  const speed = Math.min(TILE_PROGRESS_MAX, beltRate(p.upgrades.beltSpeed) * productionSpeed(p))
  const produce = productionTurns(
    ctx,
    accept,
    clearTile,
    Math.max(1, Math.ceil(TILE_PROGRESS_MAX / beltRate(p.upgrades.beltSpeed)))
  )
  type Cargo = ReturnType<typeof queries.cargo.each>[number]
  const visited = Visited.empty<number>()
  // Free the downstream cell first. Each item gets one turn, including in a cycle.
  const advance = (e: Cargo) => {
    if (Visited.has(visited, e.id)) {
      return
    }
    Visited.add(visited, e.id)
    const tile = data.tile.get(e)
    const k = key(tile)
    const machine = byCell[k]
    if (machine === undefined) {
      return
    }
    const progress = Math.min(TILE_PROGRESS_MAX, tile.progress + speed)
    const overflow = tile.progress === TILE_PROGRESS_MAX ? 0 : Math.max(0, tile.progress + speed - TILE_PROGRESS_MAX)
    data.tile.set(e, { ...tile, prevProgress: tile.progress, progress })
    if (progress < TILE_PROGRESS_MAX) {
      return
    }
    const state = queries.structures.data.building.get(machine)
    const dir = queries.structures.data.facing.get(machine).dir
    const value = data.item.get(e).value
    for (const output of outputDirections(state, dir, value)) {
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
          data.tile.set(e, { ...cell, fromDir, prevProgress: 0, progress: overflow })
        },
        underground
      )
      if (!accepted) {
        continue
      }
      const index = resources.index.get()
      const items = { ...index.items }
      delete items[k]
      if (moved) {
        items[key(dest)] = e.id
      } else {
        commands.despawn(e)
      }
      resources.index.set({ ...index, items })
      delete occupants[k]
      if (state.kind === 'splitter') {
        queries.structures.data.building.set(machine, {
          ...state,
          nextPort: output === counterClockwise[dir] ? 1 : 0,
        })
      }
      break
    }
  }
  for (const e of queries.structures.each()) {
    const kind = queries.structures.data.building.get(e).kind
    if (kind === 'buffer' || kind === 'extractor') {
      produce(e)
    }
  }
  for (const e of queries.structures.each()) {
    if (queries.structures.data.building.get(e).kind === 'combiner') {
      produce(e)
    }
  }
  for (const e of queries.cargo.each()) {
    advance(e)
  }
})
export const positions = System(
  'Beltworks/UpdateWorldPositions',
  {
    queries: { structures, cargo },
    resources: { progress: System.writeResource(Progression), time: System.readResource(Time) },
  },
  ({ queries, resources }) => {
    const dirs = Rec.fromEntries(
      Arr.map(queries.structures.each(), (e) => {
        const { data } = queries.structures
        const dir = data.facing.get(e).dir
        const state = data.building.get(e)
        return [key(data.cell.get(e)), { state, dir }] as const
      })
    )
    const { data } = queries.cargo
    for (const e of queries.cargo.each()) {
      const tile = data.tile.get(e)
      const f = tile.progress / TILE_PROGRESS_MAX
      const entry = offsets[tile.fromDir]
      const machine = dirs[key(tile)]
      const exit =
        offsets[machine === undefined ? 'N' : outputDirections(machine.state, machine.dir, data.item.get(e).value)[0]]
      const start = 0.5 * (1 - f) ** 2
      const end = 0.5 * f ** 2
      data.position.set(e, {
        x: tile.gx + 0.5 + entry.gx * start + exit.gx * end,
        y: tile.gy + 0.5 + entry.gy * start + exit.gy * end,
      })
    }
    const p = resources.progress.get()
    const current = expireDeliveries({ p, tick: resources.time.get().step })
    if (current !== p) {
      resources.progress.set(current)
    }
  }
)
