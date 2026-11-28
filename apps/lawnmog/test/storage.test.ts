import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { expect, it } from 'vitest'

import { Presence, presenceLifetime } from '../server/src/presence.ts'
import { loadBlock } from '../server/src/storage.ts'
import { createBlock, transitionBlock, viewBlock } from '../src/block.ts'
import { Command } from '../src/model.ts'
import { LegacyResident, Resident, V2Resident } from '../src/model.ts'

it('migrates the original save once and preserves the owner, lawn, clock, and experience', () => {
  const lawn = { moisture: 31, height: 54, fertility: 47, disease: 12, definition: 65, pattern: 'checker' }
  const resident = LegacyResident.cases.Player.make({
    credential: 'existing-token-hash',
    name: 'Ada',
    xp: 452,
    energy: 2,
  })
  const legacy = { tick: 3, nextTickAt: 72_000, lots: [{ id: 8, resident, lawn }] }
  const result = loadBlock({ raw: legacy, now: 5000 })
  expect(result?.save).toBe(true)
  expect(result?.block).toMatchObject({ ...legacy, lots: [{ id: 8, resident: { ...resident, coins: 0 }, lawn }] })
  expect(result?.block.lots[0]?.patches).toEqual(Array.from({ length: 64 }, () => ({ ...lawn, leaves: 0, weeds: 0 })))
  expect(loadBlock({ raw: result?.block, now: 6000 })).toEqual({ block: result?.block, save: false })
  expect(loadBlock({ raw: { ...legacy, version: 2 }, now: 6000 })).toBeUndefined()
})

it('refreshes active peers and expires stale positions', () => {
  const presence = new Presence()
  const peer = { lot: 1, name: 'Ada', x: 0, z: 1, yaw: 0 }
  presence.move(peer, 0)
  presence.move({ ...peer, lot: 2 }, 1)
  presence.move({ ...peer, x: 4 }, presenceLifetime - 1)
  expect(presence.peers(presenceLifetime + 1)).toEqual([{ ...peer, x: 4 }])
  expect(presence.peers(presenceLifetime + 1, 1)).toEqual([])
})

it('preserves v2 assets and saves tool, pattern, and metering changes across loads', () => {
  const lawn = { moisture: 60, height: 55, fertility: 60, disease: 4, definition: 25, pattern: 'straight' }
  const resident = V2Resident.cases.Player.make({
    name: 'Ada',
    credential: 'ada',
    energy: 2,
    xp: 99,
    coins: 453,
    tools: ['push', 'self-propelled', 'hose', 'sprinkler'],
  })
  const raw = {
    version: 2,
    tick: 1,
    nextTickAt: 70_000,
    lots: [{ id: 8, resident, lawn, patches: Array.from({ length: 64 }, () => lawn), sprinkler: 4 }],
  }
  const migrated = loadBlock({ raw, now: 0 })
  const block = migrated?.block
  if (block === undefined) {
    throw new Error('Migration failed')
  }
  const credential = Option.some('ada')
  expect(viewBlock({ block, credential }).player).toMatchObject({
    xp: 99,
    coins: 453,
    automaticWatering: true,
    tools: expect.arrayContaining([...resident.tools, 'reel', 'watering-can']),
  })
  const selected = transitionBlock({
    block,
    credential,
    now: 0,
    command: Command.cases.Equip.make({ tool: 'self-propelled' }),
  }).block
  const patterned = transitionBlock({
    block: selected,
    credential,
    now: 0,
    command: Command.cases.SetPattern.make({ pattern: 'checker' }),
  }).block
  const paused = transitionBlock({
    block: patterned,
    credential,
    now: 0,
    command: Command.cases.SetWatering.make({ enabled: false }),
  }).block
  expect(loadBlock({ raw: paused, now: 0 })).toEqual({ block: paused, save: false })
  const earlyV3 = {
    ...paused,
    lots: Arr.map(paused.lots, (lot) => {
      if (Resident.guards.Bot(lot.resident)) {
        return lot
      }
      const { automaticWatering: _ignored, ...earlyResident } = lot.resident
      return { ...lot, resident: earlyResident }
    }),
  }
  expect(loadBlock({ raw: earlyV3, now: 0 })?.block.lots[0]?.resident).toMatchObject({
    equipped: 'self-propelled',
    pattern: 'checker',
    automaticWatering: true,
  })
  expect(
    transitionBlock({
      block: paused,
      credential,
      now: 0,
      command: Command.cases.Work.make({ cell: 0, lot: 8, tool: 'self-propelled', pattern: 'straight' }),
    })
  ).toMatchObject({ reason: 'selection-mismatch' })
})

it('fills the lot opposite the HOA once and preserves the six existing lots', () => {
  const street = createBlock(1000)
  const raw = { ...street, lots: Arr.take(street.lots, 6) }
  const restored = loadBlock({ raw, now: 1000 })
  expect(restored?.save).toBe(true)
  expect(Arr.take(restored?.block.lots ?? [], 6)).toEqual(raw.lots)
  expect(restored?.block.lots[6]?.id).toBe(7)
  expect(restored?.block.lots[6]?.resident._tag).toBe('Bot')
  expect(loadBlock({ raw: restored?.block, now: 1000 })?.save).toBe(false)
})
