import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { expect, it } from 'vitest'

import { loadBlock } from '../server/src/storage.ts'
import { createBlock, tickMs, transitionBlock, viewBlock } from '../src/block.ts'
import type { BlockState } from '../src/model.ts'
import { Command } from '../src/model.ts'
import { seasonTicks } from '../src/seasons.ts'

const year = seasonTicks * 4
const credential = Option.none<string>()
const read = (block: BlockState) => viewBlock({ block, credential })
const advance = (block: BlockState, tick: number) => transitionBlock({ block, now: tick * tickMs, credential }).block

function claim(block: BlockState, lot: number, name: string) {
  return transitionBlock({
    block,
    now: block.nextTickAt - tickMs,
    credential: Option.some(name),
    command: Command.cases.Claim.make({ lot, name }),
  }).block
}

function prepareLawns(block: BlockState, favored?: number) {
  return {
    ...block,
    lots: Arr.map(block.lots, (lot) => ({
      ...lot,
      patches: Arr.map(lot.patches, (patch) => ({
        ...patch,
        moisture: 64,
        fertility: 74,
        height: favored === undefined || favored === lot.id ? 24 : 100,
        disease: 0,
        definition: 20,
        leaves: 100,
        weeds: 0,
      })),
    })),
  }
}

it('judges maintained lawns once per year and keeps the sign with the winner between decisions', () => {
  const street = claim(claim(createBlock(0), 1, 'Ada'), 2, 'Lee')
  const before = prepareLawns(advance(street, year - 1), 2)
  expect(read(before)).toMatchObject({ yardWinner: null, nextJudgingAt: year * tickMs })
  const awarded = advance(before, year)
  expect(read(awarded)).toMatchObject({ yardWinner: 2, nextJudgingAt: year * 2 * tickMs })
  const loaded = loadBlock({ raw: awarded, now: year * tickMs })
  if (loaded === undefined) {
    throw new Error('Invalid save')
  }
  expect(read(advance(loaded.block, year)).yardWinner).toBe(2)
  const tied = prepareLawns(advance(loaded.block, year * 2 - 1))
  expect(read(tied).yardWinner).toBe(2)
  const judged = read(advance({ ...tied, lots: [...tied.lots].reverse() }, year * 2))
  const entrants = Arr.filter(judged.lots, (lot) => !lot.bot)
  expect(entrants).toHaveLength(2)
  expect(entrants[0]?.appeal).toBe(entrants[1]?.appeal)
  expect(judged.yardWinner).toBe(1)
})

it('keeps bot-only blocks unsigned and catches up a returning resident from an older save', () => {
  const vacant = advance(createBlock(0), year)
  expect(read(vacant).yardWinner).toBeNull()
  const { yardWinner: _winner, ...legacy } = claim(vacant, 3, 'Pat')
  const loaded = loadBlock({ raw: legacy, now: year * tickMs })
  if (loaded === undefined) {
    throw new Error('Invalid save')
  }
  expect(read(loaded.block).yardWinner).toBeNull()
  expect(read(advance(loaded.block, year * 25 + 1))).toMatchObject({ yardWinner: 3, nextJudgingAt: year * 26 * tickMs })
})
