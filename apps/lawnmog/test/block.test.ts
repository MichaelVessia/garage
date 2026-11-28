import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { describe, expect, it } from 'vitest'

import { loadBlock } from '../server/src/storage.ts'
import { addressOf, createBlock, tickMs, transitionBlock, viewBlock } from '../src/block.ts'
import { quarterOf, toolCatalog } from '../src/economy.ts'
import { Command, Resident } from '../src/model.ts'
import type { BlockState, Tool } from '../src/model.ts'

const now = 1000
const claim = (block: BlockState, id: number, credential = `player-${id}`) =>
  transitionBlock({
    block,
    now,
    credential: Option.some(credential),
    command: Command.cases.Claim.make({ lot: id, name: `Player ${id}` }),
  })
const read = (block: BlockState, credential?: string) =>
  viewBlock({ block, credential: Option.fromUndefinedOr(credential) })

function session(initial = claim(createBlock(now), 1).block) {
  let block = initial
  const apply = (command: Command) => {
    const result = transitionBlock({ block, now, command, credential: Option.some('player-1') })
    block = result.block
    return result
  }
  return {
    block: () => block,
    player: () => read(block, 'player-1').player,
    work: (cell: number, tool: Tool = 'reel') =>
      apply(Command.cases.Work.make({ lot: 1, cell, tool, pattern: 'straight' })),
    equip: (tool: Tool) => apply(Command.cases.Equip.make({ tool })),
    buy: (tool: Tool) => apply(Command.cases.Buy.make({ tool })),
    apply,
  }
}

function funded(coins: number) {
  const block = claim(createBlock(now), 1).block
  return session({
    ...block,
    lots: Arr.map(block.lots, (lot) =>
      Resident.guards.Player(lot.resident) ? { ...lot, resident: { ...lot.resident, coins } } : lot
    ),
  })
}

const dryTick = (block: BlockState, steps = 1) =>
  transitionBlock({ block, now: block.nextTickAt + tickMs * (steps - 1), credential: Option.none() }).block

describe('Clover Lane', () => {
  it('opens new lots as the street fills and keeps the addresses and original claims', () => {
    let block = createBlock(now)
    for (let id = 1; id <= 9; id += 1) {
      const result = claim(block, id)
      expect(result.kind).toBe('accepted')
      block = result.block
      expect(read(block, `player-${id}`).player?.lot).toBe(id)
    }
    const publicView = read(block)
    expect(Arr.map(publicView.lots, (lot) => addressOf(lot.id))).toEqual(
      Array.from({ length: 11 }, (_, index) => `${101 + index} Clover Lane`)
    )
    expect(
      Arr.map(
        Arr.filter(publicView.lots, (lot) => lot.bot),
        (lot) => lot.id
      )
    ).toEqual([10, 11])
    expect(claim(block, 10, 'player-1').block).toBe(block)
    expect(claim(block, 1, 'another-player')).toMatchObject({ kind: 'rejected', reason: 'claim-taken' })
    expect(read(block, 'player-1').player?.lot).toBe(1)
    expect(publicView.player).toBeNull()
    expect(publicView.lots[0]).not.toHaveProperty('credential')
  })

  it('pays for distinct patches and completes four different quarter contracts', () => {
    const game = session()
    expect(game.player()).toMatchObject({
      coins: 0,
      equipped: 'reel',
      tools: ['reel', 'watering-can', 'feed', 'treat', 'rake'],
    })
    expect(game.apply(Command.cases.SetPattern.make({ pattern: 'checker' }))).toMatchObject({
      reason: 'pattern-locked',
    })
    expect(game.buy('riding')).toMatchObject({ reason: 'tool-locked' })
    expect(game.buy('push')).toMatchObject({ reason: 'insufficient-coins' })
    expect(game.work(0, 'push')).toMatchObject({ reason: 'selection-mismatch' })
    for (let quarter = 0; quarter < 4; quarter++) {
      let progress = 0
      for (let cell = 0; cell < 64; cell++) {
        if (quarterOf(cell) !== quarter) {
          continue
        }
        expect(game.player()?.contract).toMatchObject({ quarter, progress, target: 16, bonus: 20 })
        progress++
        expect(game.work(cell)).toMatchObject({ receipt: { gross: 2, cost: 0, bonus: progress === 16 ? 20 : 0 } })
        expect(game.work(cell)).toMatchObject({ reason: 'no-change' })
      }
    }
    expect(game.player()).toMatchObject({ coins: 208, xp: 128, contract: { progress: 0, quarter: 0 } })
  })

  it('allows free recovery, charges supplies up front, and withholds repeat pay', () => {
    const game = session()
    game.equip('feed')
    expect(game.work(0, 'feed')).toMatchObject({ reason: 'insufficient-coins' })
    game.equip('watering-can')
    expect(game.work(0, 'watering-can')).toMatchObject({ receipt: { gross: 2, cost: 0, bonus: 0 } })
    expect(game.work(0, 'watering-can')).toMatchObject({ reason: 'no-change' })
    game.equip('feed')
    expect(game.work(0, 'feed')).toMatchObject({ receipt: { gross: 0, cost: 1 } })
    game.equip('treat')
    expect(game.work(0, 'treat')).toMatchObject({ receipt: { gross: 0, cost: 1 } })
    expect(game.player()?.coins).toBe(0)
    game.equip('reel')
    expect(game.work(1)).toMatchObject({ receipt: { gross: 2, cost: 0 } })
    expect(game.player()?.coins).toBe(2)
  })

  it('sells prerequisite upgrades and meters wider mower and hose passes without crossing rows', () => {
    for (const [tool, width] of [
      ['push', 2],
      ['self-propelled', 3],
      ['riding', 9],
      ['hose', 3],
    ] as const) {
      const game = funded(1200)
      if (tool === 'self-propelled' || tool === 'riding') {
        game.buy('push')
      }
      if (tool === 'riding') {
        game.buy('self-propelled')
      }
      const initial = game.player()?.coins ?? 0
      expect(game.buy(tool).kind).toBe('accepted')
      expect(game.equip(tool).kind).toBe('accepted')
      expect(game.work(10, tool)).toMatchObject({ receipt: { gross: width * 2, cost: toolCatalog[tool].cost } })
      expect(game.player()?.coins).toBe(initial - toolCatalog[tool].price + width * 2 - toolCatalog[tool].cost)
      expect(game.work(10, tool)).toMatchObject({ reason: 'no-change' })
      const nextRow = game.block().lots[0]?.patches[24]
      game.work(23, tool)
      expect(game.block().lots[0]?.patches[24]).toEqual(nextRow)
    }
  })

  it.each([
    {
      stat: 'fertility',
      initial: 8,
      target: 72,
      starter: 'feed',
      middle: 'drop-spreader',
      top: 'broadcast-spreader',
      step: [8, 16, 24],
    },
    {
      stat: 'disease',
      initial: 80,
      target: 0,
      starter: 'treat',
      middle: 'pump-sprayer',
      top: 'backpack-sprayer',
      step: [-8, -18, -32],
    },
  ] as const)(
    'upgrades $stat care from one patch to a strip and then a square',
    ({ stat, initial, target, starter, middle, top, step }) => {
      const block = funded(2400).block()
      const game = session({
        ...block,
        lots: Arr.map(block.lots, (lot) => ({
          ...lot,
          patches: Arr.map(lot.patches, (patch) => ({ ...patch, [stat]: initial })),
        })),
      })
      expect(game.buy(top)).toMatchObject({ reason: 'tool-locked' })
      for (const upgrade of [middle, top]) {
        const balance = game.player()?.coins ?? 0
        expect(game.buy(upgrade).kind).toBe('accepted')
        expect(game.player()?.coins).toBe(balance - toolCatalog[upgrade].price)
      }
      for (const [tier, tool, center, footprint] of [
        [0, starter, 2, [2]],
        [1, middle, 15, [14, 15]],
        [2, top, 36, [27, 28, 29, 35, 36, 37, 43, 44, 45]],
      ] as const) {
        expect(game.equip(tool).kind).toBe('accepted')
        const before = game.block().lots[0]!.patches
        expect(game.work(center, tool)).toMatchObject({ receipt: { gross: footprint.length * 2, cost: tier + 1 } })
        const covered: ReadonlyArray<number> = footprint
        const expected = Arr.map(before, (patch, cell) => (covered.includes(cell) ? initial + step[tier] : patch[stat]))
        expect(Arr.map(game.block().lots[0]!.patches, (patch) => patch[stat])).toEqual(expected)
        for (let pass = 1; pass < Math.ceil(Math.abs((target - initial) / step[tier])); pass++) {
          expect(game.work(center, tool).kind).toBe('accepted')
        }
        expect(game.block().lots[0]!.patches[center]?.[stat]).toBe(target)
        const balance = game.player()?.coins
        expect(game.work(center, tool)).toMatchObject({ reason: 'no-change' })
        expect(game.player()?.coins).toBe(balance)
      }
      const saved = loadBlock({ raw: game.block(), now })
      expect(saved).toBeDefined()
      expect(read(saved!.block, 'player-1').player).toMatchObject({
        equipped: top,
        tools: expect.arrayContaining([starter, middle, top]),
      })
    }
  )

  it('meters unattended watering only when dry, enabled, and affordable', () => {
    for (const tool of ['sprinkler', 'irrigation'] as const) {
      const game = funded(
        toolCatalog.hose.price +
          toolCatalog.sprinkler.price +
          (tool === 'irrigation' ? toolCatalog.irrigation.price : 0) +
          12
      )
      game.buy('hose')
      game.buy('sprinkler')
      game.equip('sprinkler')
      game.work(0, 'sprinkler')
      if (tool === 'irrigation') {
        game.buy(tool)
      }
      const balance = game.player()?.coins ?? 0
      const watered = dryTick(game.block())
      expect(read(watered, 'player-1').player?.coins).toBe(balance - toolCatalog[tool].cost)
      expect(watered.lots[0]?.patches[0]?.moisture).toBe(64)
      expect(watered.lots[0]?.patches[40]?.moisture === 64).toBe(tool === 'irrigation')
      const rainy = dryTick({
        ...watered,
        tick: 11,
        lots: Arr.map(watered.lots, (lot) => ({
          ...lot,
          patches: Arr.map(lot.patches, (patch) => ({ ...patch, moisture: 70 })),
        })),
      })
      expect(read(rainy, 'player-1').player?.coins).toBe(balance - toolCatalog[tool].cost)
      game.apply(Command.cases.SetWatering.make({ enabled: false }))
      const paused = dryTick(game.block())
      expect(read(paused, 'player-1').player?.coins).toBe(balance)
      expect(paused.lots[0]?.patches[0]?.moisture).toBeLessThan(64)
      game.apply(Command.cases.SetWatering.make({ enabled: true }))
      const broke = dryTick(game.block(), 240)
      expect(read(broke, 'player-1').player?.coins).toBeGreaterThanOrEqual(0)
      expect(read(broke, 'player-1').player?.coins).toBeLessThan(toolCatalog[tool].cost)
      expect(broke.lots[0]?.patches[0]?.moisture).toBeLessThan(64)
    }
  })
})
