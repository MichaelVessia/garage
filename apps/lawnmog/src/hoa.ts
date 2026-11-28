import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { BlockState, Lawn, Lot } from './model.ts'
import { Resident } from './model.ts'

export const inspectionInterval = 8
export const nextFine = (failures: number) => Math.min(failures + 1, 3) * 5

const standards = [
  {
    metric: 'moisture',
    limit: 20,
    standard: 'Average soil moisture at or above 20',
    remedy: 'Water dry patches with the watering can.',
  },
  {
    metric: 'height',
    limit: 70,
    standard: 'Average grass height at or below 70',
    remedy: 'Mow tall patches with the reel mower.',
  },
] as const

function standardAt(tick: number) {
  return standards[Math.floor(tick / inspectionInterval) % standards.length] ?? standards[0]
}

export function inspectionNotice({ block, tickMs }: { block: BlockState; tickMs: number }) {
  const { standard, remedy } = standardAt(block.tick)
  return {
    standard,
    remedy,
    nextInspectionAt: block.nextTickAt + (inspectionInterval - 1 - (block.tick % inspectionInterval)) * tickMs,
  }
}

export function assess({ lawn, tick }: { lawn: Lawn; tick: number }) {
  const { metric, limit } = standardAt(tick)
  const value = lawn[metric]
  return { compliant: metric === 'height' ? value <= limit : value >= limit, reading: `Average ${metric}: ${value}` }
}

export function inspectLot({ lot, tick }: { lot: Lot; tick: number }): Lot {
  const { resident } = lot
  const passed = assess({ lawn: lot.lawn, tick: tick - 1 }).compliant
  const lastResult = passed ? 'passed' : 'cited'
  if (Resident.guards.Bot(resident)) {
    return { ...lot, lastResult }
  }
  const { eligibleTick, failures } = resident.inspection
  if (eligibleTick === null || tick < eligibleTick) {
    return lot
  }
  const lastFine = passed ? 0 : Math.min(resident.coins, nextFine(failures))
  return {
    ...lot,
    lastResult,
    resident: {
      ...resident,
      coins: resident.coins - lastFine,
      inspection: { eligibleTick: passed ? eligibleTick : null, failures: passed ? 0 : failures + 1, lastFine },
    },
  }
}

// Advance first so an owner's return cannot enable fines on elapsed ticks.
export function visitBlock({
  block,
  credential,
}: {
  block: BlockState
  credential: Option.Option<string>
}): BlockState {
  if (Option.isNone(credential)) {
    return block
  }
  const owner = Option.getOrUndefined(
    Arr.findFirst(
      block.lots,
      (lot) => Resident.guards.Player(lot.resident) && lot.resident.credential === credential.value
    )
  )
  if (
    owner === undefined ||
    !Resident.guards.Player(owner.resident) ||
    owner.resident.inspection.eligibleTick !== null
  ) {
    return block
  }
  const resident = owner.resident
  const updated = {
    ...owner,
    resident: { ...resident, inspection: { ...resident.inspection, eligibleTick: block.tick + inspectionInterval } },
  }
  return { ...block, lots: Arr.map(block.lots, (lot) => (lot.id === owner.id ? updated : lot)) }
}
