import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { expect, it } from 'vitest'

import { loadBlock } from '../server/src/storage.ts'
import { createBlock, tickMs, transitionBlock, viewBlock } from '../src/block.ts'
import { Command, Resident } from '../src/model.ts'
import type { BlockState } from '../src/model.ts'

const owner = Option.some('owner')
const guest = Option.none<string>()
const claim = Command.cases.Claim.make({ lot: 1, name: 'Ada' })
const read = (block: BlockState) => viewBlock({ block, credential: owner })
const visit = (block: BlockState, tick: number, credential = owner) =>
  transitionBlock({ block, now: tick * tickMs, credential }).block

function street(coins: number, now = 0) {
  const block = transitionBlock({ block: createBlock(0), now, credential: owner, command: claim }).block
  return {
    ...block,
    lots: Arr.map(block.lots, (lot) =>
      Resident.guards.Player(lot.resident) ? { ...lot, resident: { ...lot.resident, coins } } : lot
    ),
  }
}

it('publishes the deadline and charges once, even when the boundary request is retried after reload', () => {
  const before = visit(street(60), 8 - 1 / tickMs)
  expect(read(before).hoa).toMatchObject({ nextInspectionAt: 360_000, standard: expect.stringContaining('moisture') })
  expect(read(before).lots[0]?.hoa.lastResult).toBe('pending')
  let block = visit(before, 8)
  expect(read(block).hoa).toMatchObject({ nextInspectionAt: 720_000, standard: expect.stringContaining('height') })
  expect(read(block).player).toMatchObject({ coins: 55, hoa: { failures: 1, nextFine: 10, lastFine: 5 } })
  const saved = loadBlock({ raw: block, now: 8 * tickMs })
  if (saved === undefined) {
    throw new Error('Invalid save')
  }
  block = visit(saved.block, 8)
  expect(read(block).player?.coins).toBe(55)
  for (const [tick, coins, lastFine] of [
    [16, 45, 10],
    [24, 30, 15],
    [32, 15, 15],
  ] as const) {
    block = visit(block, tick)
    expect(read(block).player).toMatchObject({ coins, hoa: { lastFine, nextFine: 15 } })
  }
  block = visit(block, 40)
  expect(read(block).lots[0]?.hoa.lastResult).toBe('passed')
  expect(read(block).player?.hoa).toEqual({ failures: 0, nextFine: 5, lastFine: 0 })
  block = visit(block, 48)
  expect(read(block).player).toMatchObject({ coins: 10, hoa: { lastFine: 5 } })
})

it('limits the fine to the wallet and gives a late claimant time before inspection', () => {
  const joined = street(3, 7 * tickMs)
  expect(read(visit(joined, 8)).lots[0]?.hoa.lastResult).toBe('pending')
  const block = visit(joined, 16)
  expect(read(block).lots[0]?.hoa.lastResult).toBe('cited')
  expect(read(block).player).toMatchObject({ coins: 0, hoa: { failures: 1, lastFine: 3 } })
})

it('limits charges between owner visits even when another owner keeps the block active', () => {
  const other = Option.some('other')
  let block = transitionBlock({
    block: street(50),
    now: 0,
    credential: other,
    command: Command.cases.Claim.make({ lot: 2, name: 'Lee' }),
  }).block
  for (let tick = 1; tick <= 64; tick++) {
    block = visit(block, tick, tick % 2 === 0 ? guest : other)
  }
  block = visit(block, 1500)
  expect(read(block).player).toMatchObject({ coins: 45, hoa: { failures: 1 } })
  expect(viewBlock({ block, credential: guest }).player).toBeNull()
})

it('keeps a v3 wallet and gives returning owners grace after offline catch-up', () => {
  const original = street(41)
  const raw = {
    ...original,
    lots: Arr.map(original.lots, ({ lastResult: _result, resident, ...lot }) => {
      if (Resident.guards.Bot(resident)) {
        return { ...lot, resident }
      }
      const { inspection: _inspection, ...old } = resident
      return { ...lot, resident: old }
    }),
  }
  const decoded = loadBlock({ raw, now: 1001 * tickMs })
  if (decoded === undefined) {
    throw new Error('Invalid migration')
  }
  const first = visit(visit(decoded.block, 1000, guest), 1001)
  expect(read(visit(first, 1008)).player).toMatchObject({ coins: 41, hoa: { failures: 0 } })
  expect(read(visit(first, 1016)).lots[0]?.hoa.lastResult).not.toBe('pending')
})

it('lets the starter watering can and reel mower meet both standards', () => {
  let block = visit(street(0), 7)
  function work(tick: number, tool: 'watering-can' | 'reel') {
    const now = tick * tickMs
    block = transitionBlock({ block, now, credential: owner, command: Command.cases.Equip.make({ tool }) }).block
    for (let cell = 0; cell < 64; cell++) {
      block = transitionBlock({
        block,
        now,
        credential: owner,
        command: Command.cases.Work.make({ tool, cell, lot: 1, pattern: 'straight' }),
      }).block
    }
  }
  expect(read(block).lots[0]?.hoa.compliant).toBe(false)
  work(7, 'watering-can')
  block = visit(block, 8)
  expect(read(block).lots[0]?.hoa).toMatchObject({ lastResult: 'passed', compliant: false })
  block = visit(block, 15)
  work(15, 'reel')
  block = visit(block, 16)
  expect(read(block).lots[0]?.hoa.lastResult).toBe('passed')
})
