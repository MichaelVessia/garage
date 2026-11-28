import * as Arr from 'effect/Array'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'

import { quarterOf, toolCatalog } from './economy.ts'
import { assess, inspectLot, nextFine, inspectionInterval, inspectionNotice, visitBlock } from './hoa.ts'
import type {
  BlockState,
  BlockView,
  Command,
  Lawn,
  Lot,
  Pattern,
  Rejection,
  Weather,
  Tool,
  LegacyBlock,
  V2Block,
  V3Block,
} from './model.ts'
import { Command as Commands, gridSize, starterLeafBag, LegacyResident, Resident, V2Resident } from './model.ts'
import type { LeafLanding } from './seasons.ts'
import { leafLanding, seasonalCover, seasonAt, seasonTicks } from './seasons.ts'

export const tickMs = 45_000
export const patchReward = 2
export const maxEnergy = 6
export const patterns = {
  straight: { name: 'Straight', xp: 0 },
  crosscut: { name: 'Crosscut', xp: 12 },
  diagonal: { name: 'Diagonal', xp: 28 },
  checker: { name: 'Checkerboard', xp: 52 },
} satisfies Record<Pattern, { name: string; xp: number }>

const botNames = ['The Parkers', 'Nora Reed', 'The Nguyens', 'Ellis Green', 'Sam Brooks', 'The Riveras']
const weatherCycle: ReadonlyArray<Weather> = ['sunny', 'sunny', 'overcast', 'rain', 'overcast', 'sunny']
const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const weatherAt = (tick: number): Weather => weatherCycle[Math.floor(tick / 4) % weatherCycle.length] ?? 'sunny'

export const addressOf = (id: number): string => `${100 + id} Clover Lane`

const starterTools: ReadonlyArray<Tool> = ['reel', 'watering-can', 'feed', 'treat', 'rake']
const starterSelection = {
  baggedLeaves: starterLeafBag,
  inspection: { eligibleTick: null, failures: 0, lastFine: 0 },
  equipped: 'reel',
  pattern: 'straight',
  automaticWatering: true,
  quarter: 0,
  paidCells: [],
  mowed: [],
} as const
const contractTarget = 16
const contractBonus = 20
const quarters = ['house-side left', 'house-side right', 'street-side left', 'street-side right']

export function migrateV2(old: typeof V2Block.Type): BlockState {
  return {
    ...old,
    version: 4,
    estateLeaves: 0,
    karenAnger: 0,
    lots: Arr.map(old.lots, (lot) => ({
      ...lot,
      lastResult: 'pending',
      resident: V2Resident.guards.Player(lot.resident)
        ? { ...lot.resident, ...starterSelection, tools: Arr.dedupe([...lot.resident.tools, ...starterTools]) }
        : lot.resident,
    })),
  }
}

export function migrateV3(old: typeof V3Block.Type): BlockState {
  return {
    ...old,
    version: 4,
    estateLeaves: 0,
    karenAnger: 0,
    lots: Arr.map(old.lots, (lot) =>
      Resident.guards.Player(lot.resident)
        ? { ...lot, resident: { ...lot.resident, tools: Arr.dedupe([...lot.resident.tools, 'rake' as const]) } }
        : lot
    ),
  }
}

export function migrateBlock(old: typeof LegacyBlock.Type): BlockState {
  return migrateV2({
    ...old,
    version: 2,
    lots: Arr.map(old.lots, (lot) => ({
      ...lot,
      patches: Array.from({ length: gridSize ** 2 }, () => lot.lawn),
      sprinkler: null,
      resident: LegacyResident.guards.Player(lot.resident)
        ? { ...lot.resident, coins: 0, tools: ['push', 'hose', 'feed', 'treat'] }
        : lot.resident,
    })),
  })
}

function botLot(id: number, tick = 0): Lot {
  const lawn: Lawn = {
    weeds: 0,
    leaves: 0,
    moisture: 34 + ((id * 17) % 45),
    fertility: 29 + ((id * 13) % 44),
    height: 32 + ((id * 19) % 42),
    disease: (id * 11) % 35,
    definition: 25 + ((id * 7) % 40),
    pattern: id % 3 === 0 ? 'diagonal' : 'straight',
  }
  const patches = Array.from({ length: gridSize ** 2 }, (_, cell) => {
    const offset = ((cell * 7 + id) % 11) - 5
    return {
      ...lawn,
      leaves: seasonAt(tick) === 'autumn' && (cell + id) % 3 === 0 ? 18 + offset : 0,
      moisture: clamp(lawn.moisture + offset),
      height: lawn.height + offset,
    }
  })
  return {
    id,
    lastResult: 'pending',
    resident: Resident.cases.Bot.make({
      name: id === 7 ? 'June Bell' : (botNames[(id - 1) % botNames.length] ?? 'Neighbor'),
    }),
    patches,
    sprinkler: null,
    lawn: aggregate(patches, lawn.pattern),
  }
}

// The HOA occupies one side of a column. An odd resident count fills the other side.
export function fillOppositeHome(block: BlockState): BlockState {
  if (block.lots.length % 2 !== 0) {
    return block
  }
  const id = Arr.reduce(block.lots, 0, (highest, lot) => Math.max(highest, lot.id)) + 1
  return { ...block, lots: [...block.lots, botLot(id, block.tick)] }
}

export function createBlock(now: number): BlockState {
  return {
    version: 4,
    estateLeaves: 0,
    karenAnger: 0,
    lots: Array.from({ length: 7 }, (_, index) => botLot(index + 1)),
    tick: 0,
    nextTickAt: now + tickMs,
  }
}

function appeal(lawn: Lawn): number {
  return clamp(
    Math.round(
      90 -
        Math.abs(64 - lawn.moisture) * 0.41 -
        Math.abs(72 - lawn.fertility) * 0.29 -
        Math.abs(27 - lawn.height) * 0.66 -
        lawn.disease * 0.46 -
        lawn.weeds * 0.21 -
        lawn.leaves * 0.22 +
        lawn.definition * (lawn.pattern === 'straight' ? 0.08 : 0.12)
    )
  )
}

function aggregate(patches: ReadonlyArray<Lawn>, pattern: Pattern): Lawn {
  const mean = (key: Exclude<keyof Lawn, 'pattern'>) =>
    Math.round(Arr.reduce(patches, 0, (sum, patch) => sum + patch[key]) / patches.length)
  return {
    weeds: mean('weeds'),
    leaves: mean('leaves'),
    moisture: mean('moisture'),
    fertility: mean('fertility'),
    height: mean('height'),
    disease: mean('disease'),
    definition: mean('definition'),
    pattern,
  }
}

function careFor(lawn: Lawn, tool: Tool, pattern: Pattern): Lawn {
  switch (tool) {
    case 'reel':
    case 'push':
    case 'self-propelled':
    case 'riding':
      return lawn.height > 30 || lawn.weeds > 0 ? { ...lawn, weeds: 0, pattern, height: 25, definition: 100 } : lawn
    case 'rake':
      return { ...lawn, leaves: 0 }
    case 'handheld-blower':
    case 'backpack-blower':
      return lawn
    case 'sprinkler':
    case 'watering-can':
    case 'hose':
    case 'irrigation':
      return { ...lawn, moisture: Math.max(lawn.moisture, Math.min(64, lawn.moisture + 27)) }
    case 'feed':
    case 'drop-spreader':
    case 'broadcast-spreader': {
      const dose = { feed: 8, 'drop-spreader': 16, 'broadcast-spreader': 24 }[tool]
      return { ...lawn, fertility: Math.max(lawn.fertility, Math.min(72, lawn.fertility + dose)) }
    }
    case 'treat':
    case 'pump-sprayer':
    case 'backpack-sprayer': {
      const dose = { treat: 8, 'pump-sprayer': 18, 'backpack-sprayer': 32 }[tool]
      return { ...lawn, disease: Math.max(0, lawn.disease - dose) }
    }
  }
}

function covers(tool: Tool, center: number, cell: number): boolean {
  const dx = (cell % gridSize) - (center % gridSize)
  const dz = Math.floor(cell / gridSize) - Math.floor(center / gridSize)
  if (tool === 'backpack-blower') {
    return Math.abs(dx) <= 2 && Math.abs(dz) <= 2
  }
  if (
    tool === 'riding' ||
    tool === 'sprinkler' ||
    tool === 'handheld-blower' ||
    tool === 'broadcast-spreader' ||
    tool === 'backpack-sprayer'
  ) {
    return Math.abs(dx) <= 1 && Math.abs(dz) <= 1
  }
  if (tool === 'push') {
    return (dx === 0 || dx === 1) && dz === 0
  }
  if (tool === 'self-propelled' || tool === 'hose' || tool === 'drop-spreader' || tool === 'pump-sprayer') {
    return Math.abs(dx) <= 1 && dz === 0
  }
  return cell === center
}

const moistureChange: Record<Weather, number> = { rain: 13, overcast: -3, sunny: -7 }

// Loose leaves share the patch with deliveries. Remove the oldest delivered leaves first.
function usedPiles(lot: Lot, patches: Lot['patches']): Pick<Lot, 'returnPiles'> {
  if (lot.returnPiles === undefined || lot.returnPiles.length === 0) {
    return {}
  }
  const used = MutableHashMap.empty<number, number>()
  return {
    returnPiles: Arr.flatMap(lot.returnPiles, (pile) => {
      const removed =
        Option.getOrUndefined(MutableHashMap.get(used, pile.cell)) ??
        Math.max(0, (lot.patches[pile.cell]?.leaves ?? 0) - (patches[pile.cell]?.leaves ?? 0))
      MutableHashMap.set(used, pile.cell, Math.max(0, removed - pile.amount))
      return pile.amount > removed ? [{ ...pile, amount: pile.amount - removed }] : []
    }),
  }
}

function upkeep(lot: Lot, tick: number): Lot {
  const { resident } = lot
  const weather = weatherAt(tick)
  const season = seasonAt(tick)
  const nutrientUse = { spring: 4, summer: 3, autumn: 2, winter: 1 }[season]
  const irrigated = Resident.guards.Player(resident) && resident.tools.includes('irrigation')
  const autoTool = irrigated ? 'irrigation' : 'sprinkler'
  const waterCost = toolCatalog[autoTool].cost
  const canWater = Resident.guards.Player(resident) && resident.automaticWatering && resident.coins >= waterCost
  let ranWater = false
  const botWorks = Resident.guards.Bot(resident) && (tick + lot.id) % (2 + (lot.id % 3)) === 0
  const patches = Arr.map(lot.patches, (patch, cell) => {
    const watered = irrigated || (lot.sprinkler !== null && covers('sprinkler', lot.sprinkler, cell))
    const moisture = clamp(patch.moisture + moistureChange[weather])
    const useWater = canWater && watered && moisture < 64
    ranWater ||= useWater
    const lawn = {
      ...patch,
      ...seasonalCover({ patch, lot: lot.id, cell, tick, season, maintained: botWorks }),
      moisture: useWater ? 64 : moisture,
      fertility: clamp(patch.fertility - nutrientUse),
      height: clamp(patch.height + (season === 'winter' ? 1 : moisture > 30 && patch.fertility > 30 ? 6 : 3)),
      disease: clamp(patch.disease + (moisture > 79 ? 8 : moisture < 24 ? 3 : 1) + (patch.fertility < 32 ? 2 : 0)),
      definition: clamp(patch.definition - 12),
    }
    if (!botWorks) {
      return lawn
    }
    const tool =
      lawn.disease >= 30
        ? 'backpack-sprayer'
        : lawn.moisture < 45
          ? 'hose'
          : lawn.height > 43
            ? 'push'
            : 'broadcast-spreader'
    return careFor(lawn, tool, lawn.pattern)
  })
  return {
    ...lot,
    ...usedPiles(lot, patches),
    patches,
    lawn: aggregate(patches, lot.lawn.pattern),
    resident: Resident.guards.Player(resident)
      ? {
          ...resident,
          coins: resident.coins - (ranWater ? waterCost : 0),
          energy: Math.min(maxEnergy, resident.energy + 1),
        }
      : resident,
  }
}

const yearTicks = seasonTicks * 4
export const judgingIntervalMs = yearTicks * tickMs

function winningYard(lots: ReadonlyArray<Lot>) {
  let winner: BlockView['yardWinner'] = null
  let bestScore = -1
  for (const lot of lots) {
    if (Resident.guards.Player(lot.resident)) {
      const score = appeal(lot.lawn)
      if (score > bestScore || (score === bestScore && winner !== null && lot.id < winner)) {
        winner = lot.id
        bestScore = score
      }
    }
  }
  return winner
}

function advance(block: BlockState, now: number): BlockState {
  if (now < block.nextTickAt) {
    return block
  }
  const elapsed = 1 + Math.floor((now - block.nextTickAt) / tickMs)
  const tick = block.tick + elapsed
  let lots = block.lots
  let yardWinner = block.yardWinner ?? null
  // Limit catch-up work after a long absence. Use the most recent ticks.
  for (let step = Math.max(block.tick + 1, tick - 239); step <= tick; step += 1) {
    lots = Arr.map(lots, (lot) => upkeep(lot, step))
    if (step % yearTicks === 0) {
      yardWinner = winningYard(lots)
    }
    if (step % inspectionInterval === 0) {
      lots = Arr.map(lots, (lot) => inspectLot({ lot, tick: step }))
    }
  }
  return {
    ...block,
    yardWinner,
    estateLeaves: Math.max(0, block.estateLeaves - elapsed * 12),
    karenAnger: Math.max(0, block.karenAnger - elapsed * 10),
    lots,
    tick,
    nextTickAt: block.nextTickAt + elapsed * tickMs,
  }
}

type Transition =
  | { readonly kind: 'accepted'; readonly block: BlockState; readonly receipt?: NonNullable<BlockView['receipt']> }
  | { readonly kind: 'rejected'; readonly block: BlockState; readonly reason: Rejection }

// Fill a pile near the curb first. Use the emptiest patch if the whole gust cannot fit.
function landingCell(patches: Lot['patches'], amount: number) {
  let best = patches.length - 1
  for (let i = patches.length - 1; i >= 0; i--) {
    const leaves = patches[i]?.leaves ?? 100
    if (100 - leaves >= amount) {
      return i
    }
    if (leaves < (patches[best]?.leaves ?? 100)) {
      best = i
    }
  }
  return best
}

function blowLeaves({
  block,
  lot,
  resident,
  command,
  tool,
}: {
  block: BlockState
  lot: Lot
  resident: typeof Resident.cases.Player.Type
  command:
    | typeof Commands.cases.Work.Type
    | typeof Commands.cases.LaunchLeaves.Type
    | typeof Commands.cases.ReturnPile.Type
  tool: 'handheld-blower' | 'backpack-blower'
}): Transition {
  const backpack = tool === 'backpack-blower'
  const limit = backpack ? 65 : 25
  const targeted = !Commands.guards.Work(command)
  const returning = Commands.guards.ReturnPile(command)
  const pile = returning
    ? Option.getOrUndefined(
        Arr.findFirst(
          lot.returnPiles ?? [],
          (p) => p.id === command.id && p.cell === command.cell && p.senderLot === command.senderLot
        )
      )
    : undefined
  if (returning && pile === undefined) {
    return { kind: 'rejected', block, reason: 'no-leaves' }
  }
  let amount: number
  let landing: LeafLanding
  if (targeted) {
    const destination = returning ? command.senderLot : command.destination
    const index = Option.getOrElse(
      Arr.findFirstIndex(block.lots, (entry) => entry.id === destination),
      () => -1
    )
    const neighbor = block.lots[index]
    if (destination !== 0 && (neighbor === undefined || neighbor === lot)) {
      return { kind: 'rejected', block, reason: 'invalid-destination' }
    }
    amount =
      pile === undefined
        ? Math.min(
            limit,
            Arr.reduce(lot.patches, resident.baggedLeaves, (sum, patch) => sum + patch.leaves)
          )
        : Math.min(pile.amount, lot.patches[pile.cell]?.leaves ?? 0)
    if (amount === 0) {
      return { kind: 'rejected', block, reason: 'no-leaves' }
    }
    landing =
      neighbor === undefined
        ? { kind: 'estate', cell: 59 }
        : { kind: 'lawn', index, cell: landingCell(neighbor.patches, amount) }
  } else {
    amount = Math.min(limit, lot.patches[command.cell]?.leaves ?? 0)
    if (amount === 0 || command.direction === undefined) {
      return { kind: 'rejected', block, reason: 'no-change' }
    }
    landing = leafLanding({
      source: block.lots.indexOf(lot),
      cell: command.cell,
      direction: command.direction,
      distance: backpack ? 3 : 1,
      lotCount: block.lots.length,
    })
  }
  const target = landing.kind === 'lawn' ? block.lots[landing.index] : undefined
  const targetLeaves = landing.kind === 'lawn' ? (target?.patches[landing.cell]?.leaves ?? 0) : 0
  if (returning && amount > 100 - targetLeaves) {
    return { kind: 'rejected', block, reason: 'lawn-full' }
  }
  amount = Math.min(amount, 100 - targetLeaves)
  if (amount === 0) {
    return { kind: 'rejected', block, reason: targeted ? 'lawn-full' : 'no-change' }
  }
  const cost = toolCatalog[tool].cost
  if (resident.coins < cost) {
    return { kind: 'rejected', block, reason: 'insufficient-coins' }
  }
  const cited = landing.kind === 'estate'
  const fine = cited ? Math.min(10, resident.coins - cost) : 0
  let remaining = amount
  let sourceCell = 59
  let largestPickup = 0
  const cleared = Arr.map(lot.patches, (patch, i) => {
    if (remaining === 0 || patch.leaves === 0 || (!Commands.guards.LaunchLeaves(command) && i !== command.cell)) {
      return patch
    }
    const pickup = Math.min(remaining, patch.leaves)
    remaining -= pickup
    if (pickup > largestPickup) {
      largestPickup = pickup
      sourceCell = i
    }
    return { ...patch, leaves: patch.leaves - pickup }
  })
  const lots = Arr.map(block.lots, (entry) => {
    if (entry !== lot && entry !== target) {
      return entry
    }
    let patches = entry === lot ? cleared : entry.patches
    if (entry === target && landing.kind === 'lawn') {
      patches = Arr.map(patches, (patch, i) =>
        i === landing.cell ? { ...patch, leaves: patch.leaves + amount } : patch
      )
    }
    let pileUpdate: Pick<Lot, 'returnPiles' | 'lastPileId'> = {}
    if (entry === lot) {
      pileUpdate =
        pile !== undefined
          ? { returnPiles: Arr.filter(entry.returnPiles ?? [], (p) => p.id !== pile.id) }
          : usedPiles(lot, cleared)
    } else if (landing.kind === 'lawn') {
      const id = (entry.lastPileId ?? 0) + 1
      pileUpdate = {
        lastPileId: id,
        returnPiles: [...(entry.returnPiles ?? []), { id, amount, cell: landing.cell, senderLot: lot.id }],
      }
    }
    let owner = entry.resident
    if (entry === lot) {
      owner = { ...resident, baggedLeaves: resident.baggedLeaves - remaining, coins: resident.coins - cost - fine }
    } else if (Resident.guards.Player(owner) && landing.kind === 'lawn') {
      owner = {
        ...owner,
        lastDelivery: {
          id: (owner.lastDelivery?.id ?? 0) + 1,
          sender: resident.name,
          amount,
          senderLot: lot.id,
          sourceCell,
          landingCell: landing.cell,
        },
      }
    }
    return {
      ...entry,
      ...pileUpdate,
      patches,
      lawn: aggregate(patches, entry.lawn.pattern),
      resident: owner,
    }
  })
  return {
    kind: 'accepted',
    block: {
      ...block,
      lots,
      estateLeaves: block.estateLeaves + (cited ? amount : 0),
      karenAnger: Math.min(100, block.karenAnger + (cited ? 45 : 0)),
    },
    receipt: {
      gross: 0,
      cost,
      bonus: 0,
      leafAmount: amount,
      leafSourceCell: sourceCell,
      ...(landing.kind !== 'cleared' && { leafCell: landing.cell, leafDestination: target?.id ?? 0 }),
      ...(cited && { fine }),
    },
  }
}

export function transitionBlock(input: {
  readonly block: BlockState
  readonly now: number
  readonly credential: Option.Option<string>
  readonly command?: Command
}): Transition {
  const block = visitBlock({ block: advance(input.block, input.now), credential: input.credential })
  const { command, credential } = input
  if (command === undefined) {
    return { kind: 'accepted', block }
  }
  const player = Option.getOrUndefined(
    Arr.findFirst(
      block.lots,
      (lot) => Resident.guards.Player(lot.resident) && Option.contains(credential, lot.resident.credential)
    )
  )
  if (Commands.guards.Claim(command)) {
    if (player !== undefined) {
      return { kind: 'accepted', block }
    }
    if (Option.isNone(credential)) {
      return { kind: 'rejected', block, reason: 'claim-required' }
    }
    const target = Option.getOrUndefined(Arr.findFirst(block.lots, (lot) => lot.id === command.lot))
    if (target === undefined || !Resident.guards.Bot(target.resident)) {
      return { kind: 'rejected', block, reason: 'claim-taken' }
    }
    const claimed: Lot = {
      ...target,
      lastResult: 'pending',
      resident: Resident.cases.Player.make({
        name: command.name,
        credential: credential.value,
        energy: maxEnergy,
        xp: 0,
        coins: 0,
        tools: starterTools,
        ...starterSelection,
        inspection: { ...starterSelection.inspection, eligibleTick: block.tick + inspectionInterval },
      }),
    }
    const lots = Arr.map(block.lots, (lot) => (lot.id === target.id ? claimed : lot))
    if (Arr.every(lots, (lot) => Resident.guards.Player(lot.resident))) {
      const last = lots.length
      lots.push(botLot(last + 1, block.tick), botLot(last + 2, block.tick))
    }
    return { kind: 'accepted', block: { ...block, lots } }
  }

  if (player === undefined || !Resident.guards.Player(player.resident)) {
    return { kind: 'rejected', block, reason: 'claim-required' }
  }
  const { resident } = player
  const reject = (reason: Rejection): Transition => ({ kind: 'rejected', block, reason })
  let receipt: BlockView['receipt']
  let updated: Lot
  if (
    Commands.guards.LaunchLeaves(command) ||
    Commands.guards.ReturnPile(command) ||
    Commands.guards.SweepLeaves(command)
  ) {
    const tool = resident.equipped
    if (tool !== 'handheld-blower' && tool !== 'backpack-blower') {
      return reject('selection-mismatch')
    }
    if (!Commands.guards.SweepLeaves(command)) {
      return blowLeaves({ block, lot: player, resident, command, tool })
    }
    let gathered = 0
    const patches = Arr.map(player.patches, (patch, index) => {
      if (patch.leaves === 0 || !covers(tool, command.cell, index)) {
        return patch
      }
      gathered += patch.leaves
      return { ...patch, leaves: 0 }
    })
    if (gathered === 0) {
      return reject('no-change')
    }
    const cost = toolCatalog[tool].cost
    if (resident.coins < cost) {
      return reject('insufficient-coins')
    }
    receipt = { gross: 0, cost, bonus: 0, leafAmount: gathered }
    updated = {
      ...player,
      patches,
      lawn: aggregate(patches, player.lawn.pattern),
      resident: { ...resident, baggedLeaves: resident.baggedLeaves + gathered, coins: resident.coins - cost },
    }
  } else if (Commands.guards.SetWatering(command)) {
    updated = { ...player, resident: { ...resident, automaticWatering: command.enabled } }
  } else if (Commands.guards.SetPattern(command)) {
    if (resident.xp < patterns[command.pattern].xp) {
      return reject('pattern-locked')
    }
    updated = { ...player, resident: { ...resident, pattern: command.pattern } }
  } else if (Commands.guards.Equip(command)) {
    if (command.tool !== null && (!resident.tools.includes(command.tool) || command.tool === 'irrigation')) {
      return reject('tool-locked')
    }
    updated = { ...player, resident: { ...resident, equipped: command.tool } }
  } else if (Commands.guards.Buy(command)) {
    const { tool } = command
    const { price, requires } = toolCatalog[tool]
    if (resident.tools.includes(tool)) {
      return reject('already-owned')
    }
    if (requires === null || !resident.tools.includes(requires)) {
      return reject('tool-locked')
    }
    if (resident.coins < price) {
      return reject('insufficient-coins')
    }
    updated = { ...player, resident: { ...resident, coins: resident.coins - price, tools: [...resident.tools, tool] } }
  } else {
    const { tool, pattern } = command
    if (command.lot !== player.id) {
      return reject('not-owner')
    }
    if (tool !== resident.equipped || pattern !== resident.pattern) {
      return reject('selection-mismatch')
    }
    if (tool === 'handheld-blower' || tool === 'backpack-blower') {
      return blowLeaves({ block, lot: player, resident, command, tool })
    }
    const mowing = tool === 'reel' || tool === 'push' || tool === 'self-propelled' || tool === 'riding'
    let effective = 0
    let gross = 0
    let baggedLeaves = resident.baggedLeaves
    const paidCells = [...resident.paidCells]
    const mowed = [...resident.mowed]
    const patches = Arr.map(player.patches, (patch, index) => {
      if (!covers(tool, command.cell, index)) {
        return patch
      }
      const next = careFor(patch, tool, pattern)
      if (tool === 'rake') {
        baggedLeaves += patch.leaves - next.leaves
      }
      if (
        next.weeds !== patch.weeds ||
        next.leaves !== patch.leaves ||
        next.height !== patch.height ||
        next.fertility !== patch.fertility ||
        next.moisture !== patch.moisture ||
        next.disease !== patch.disease
      ) {
        effective += 1
        if (!paidCells.includes(index)) {
          gross += patchReward
          paidCells.push(index)
          if (paidCells.length === 16) {
            paidCells.length = 0
          }
        }
        if (mowing && quarterOf(index) === resident.quarter && !mowed.includes(index)) {
          mowed.push(index)
        }
      }
      return next
    })
    const sprinkler = tool === 'sprinkler' ? command.cell : player.sprinkler
    if (effective === 0 && sprinkler === player.sprinkler) {
      return reject('no-change')
    }
    const cost = effective > 0 ? toolCatalog[tool].cost : 0
    if (resident.coins < cost) {
      return reject('insufficient-coins')
    }
    const finished = mowed.length === contractTarget
    const bonus = finished ? contractBonus : 0
    receipt = { gross, cost, bonus }
    updated = {
      ...player,
      patches,
      sprinkler,
      lawn: aggregate(patches, mowing ? pattern : player.lawn.pattern),
      resident: {
        ...resident,
        paidCells,
        baggedLeaves,
        xp: resident.xp + gross,
        coins: resident.coins + gross + bonus - cost,
        quarter: finished ? (resident.quarter + 1) % 4 : resident.quarter,
        mowed: finished ? [] : mowed,
      },
    }
  }
  if (updated.patches !== player.patches) {
    updated = { ...updated, ...usedPiles(player, updated.patches) }
  }
  const lots = Arr.map(block.lots, (lot) => (lot.id === updated.id ? updated : lot))
  return { kind: 'accepted', block: { ...block, lots }, ...(receipt && { receipt }) }
}

export function viewBlock({ block, credential }: { block: BlockState; credential: Option.Option<string> }): BlockView {
  const lot = Option.getOrUndefined(
    Arr.findFirst(
      block.lots,
      (entry) => Resident.guards.Player(entry.resident) && Option.contains(credential, entry.resident.credential)
    )
  )
  const player =
    lot !== undefined && Resident.guards.Player(lot.resident)
      ? {
          hoa: {
            nextFine: nextFine(lot.resident.inspection.failures),
            lastFine: lot.resident.inspection.lastFine,
            failures: lot.resident.inspection.failures,
          },
          baggedLeaves: lot.resident.baggedLeaves,
          ...(lot.resident.lastDelivery && { lastDelivery: lot.resident.lastDelivery }),
          lot: lot.id,
          xp: lot.resident.xp,
          energy: lot.resident.energy,
          coins: lot.resident.coins,
          tools: lot.resident.tools,
          equipped: lot.resident.equipped,
          pattern: lot.resident.pattern,
          automaticWatering: lot.resident.automaticWatering,
          contract: {
            quarter: lot.resident.quarter,
            description: `Mow the 16 patches in the ${quarters[lot.resident.quarter]} quarter.`,
            progress: lot.resident.mowed.length,
            target: contractTarget,
            bonus: contractBonus,
          },
        }
      : null
  return {
    player,
    hoa: inspectionNotice({ block, tickMs }),
    yardWinner: block.yardWinner ?? null,
    nextJudgingAt: block.nextTickAt + (yearTicks - 1 - (block.tick % yearTicks)) * tickMs,
    nextSeasonAt: block.nextTickAt + (seasonTicks - 1 - (block.tick % seasonTicks)) * tickMs,
    season: seasonAt(block.tick),
    karenAnger: block.karenAnger,
    estateLeaves: block.estateLeaves,
    weather: weatherAt(block.tick),
    nextTickAt: block.nextTickAt,
    lots: Arr.map(block.lots, ({ id, lawn, resident, patches, sprinkler, lastResult, returnPiles }) => ({
      returnPiles: returnPiles ?? [],
      id,
      lawn,
      patches,
      sprinkler,
      name: resident.name,
      bot: Resident.guards.Bot(resident),
      appeal: appeal(lawn),
      hoa: { ...assess({ lawn, tick: block.tick }), lastResult },
    })),
  }
}
