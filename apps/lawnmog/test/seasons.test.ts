import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { expect, it } from 'vitest'

import { loadBlock } from '../server/src/storage.ts'
import { createBlock, tickMs, transitionBlock, viewBlock } from '../src/block.ts'
import type { BlockState, Direction, Tool } from '../src/model.ts'
import { Command, Resident } from '../src/model.ts'
import { seasonTicks } from '../src/seasons.ts'

const credential = Option.some('owner')
const view = (block: BlockState) => viewBlock({ block, credential })
const advance = (block: BlockState, tick: number) => transitionBlock({ block, credential, now: tick * tickMs }).block
const act = (block: BlockState, command: Command) =>
  transitionBlock({ block, command, credential, now: block.nextTickAt - 1 })
const equip = (block: BlockState, tool: Tool) => act(block, Command.cases.Equip.make({ tool })).block
const buy = (block: BlockState, tool: Tool) => act(block, Command.cases.Buy.make({ tool }))
const work = (block: BlockState, lot: number, cell: number, tool: Tool, direction: Direction = 'north') =>
  act(block, Command.cases.Work.make({ lot, cell, tool, pattern: 'straight', direction }))

function street(id: number, coins: number) {
  const claimed = act(createBlock(0), Command.cases.Claim.make({ lot: id, name: 'Pat' })).block
  return {
    ...claimed,
    lots: Arr.map(claimed.lots, (lot) => ({
      ...lot,
      patches: Arr.map(lot.patches, (patch) => ({ ...patch, leaves: lot.id === id ? 50 : 0 })),
      resident: Resident.guards.Player(lot.resident) ? { ...lot.resident, coins } : lot.resident,
    })),
  }
}

it('rotates the street calendar, drops leaves in autumn, and grows weeds in spring and summer', () => {
  const initial = street(1, 0)
  const fall = advance(initial, seasonTicks - 1)
  const winter = advance(fall, seasonTicks)
  const spring = advance(winter, seasonTicks * 2)
  const summer = advance(spring, seasonTicks * 3)
  expect(
    Arr.map([initial, winter, spring, summer, advance(summer, seasonTicks * 4)], (state) => view(state).season)
  ).toEqual(['autumn', 'winter', 'spring', 'summer', 'autumn'])
  expect(view(fall).nextSeasonAt).toBe(135_000)
  expect(view(winter).nextSeasonAt).toBe(2 * seasonTicks * tickMs)
  expect(fall.lots[0]?.lawn.leaves).toBeGreaterThan(50)
  expect(winter.lots[0]?.lawn.leaves).toBeLessThan(fall.lots[0]?.lawn.leaves ?? 0)
  expect(winter.lots[0]?.lawn.weeds).toBe(0)
  expect(spring.lots[0]?.lawn.weeds).toBeGreaterThan(0)
  expect(summer.lots[0]?.lawn.weeds).toBeGreaterThan(spring.lots[0]?.lawn.weeds ?? 0)
  const result = work(summer, 1, 0, 'reel')
  expect(result.block.lots[0]?.patches[0]?.weeds).toBe(0)
})

it('bags leaves with the free rake and moves a larger pile farther with the backpack upgrade', () => {
  let block = equip(street(1, 500), 'rake')
  expect(buy(block, 'backpack-blower')).toMatchObject({ reason: 'tool-locked' })
  const raked = work(block, 1, 0, 'rake')
  expect(raked).toMatchObject({ receipt: { gross: 2, cost: 0 } })
  expect(raked.block.lots[0]?.patches[0]?.leaves).toBe(0)
  expect(work(raked.block, 1, 0, 'rake')).toMatchObject({ reason: 'no-change' })
  block = equip(buy(raked.block, 'handheld-blower').block, 'handheld-blower')
  const one = work(block, 1, 8, 'handheld-blower', 'east')
  expect(one).toMatchObject({ receipt: { gross: 0, cost: 1, leafAmount: 25, leafCell: 9, leafDestination: 1 } })
  expect(one.block.lots[0]?.patches[9]?.leaves).toBe(75)
  block = equip(buy(one.block, 'backpack-blower').block, 'backpack-blower')
  const across = work(block, 1, 55, 'backpack-blower', 'south')
  expect(across).toMatchObject({ receipt: { gross: 0, cost: 2, leafAmount: 50, leafCell: 48, leafDestination: 2 } })
  expect(across.block.lots[0]?.patches[55]?.leaves).toBe(0)
  expect(across.block.lots[1]?.patches[48]?.leaves).toBe(50)
  expect(viewBlock({ block: across.block, credential: Option.none() }).lots[1]?.patches[48]?.leaves).toBe(50)
  expect(work(across.block, 2, 48, 'backpack-blower')).toMatchObject({ reason: 'not-owner' })
})

it('charges the blower owner on delivery across the street, and lets the landscapers settle Karen down', () => {
  const block = equip(buy(street(7, 67), 'handheld-blower').block, 'handheld-blower')
  const blow = work(block, 7, 56, 'handheld-blower', 'north')
  expect(blow).toMatchObject({
    receipt: { gross: 0, cost: 1, fine: 6, leafAmount: 25, leafCell: 63, leafDestination: 0 },
  })
  expect(view(blow.block)).toMatchObject({ estateLeaves: 25, karenAnger: 45, player: { coins: 0 } })
  expect(work(blow.block, 7, 56, 'handheld-blower', 'north')).toMatchObject({ reason: 'insufficient-coins' })
  const saved = loadBlock({ raw: blow.block, now: 0 })
  expect(saved?.block).toEqual(blow.block)
  expect(view(advance(blow.block, 5))).toMatchObject({ estateLeaves: 0, karenAnger: 0 })
})

it('upgrades existing v3 owners with a free rake and keeps their selected tool, property and wallet', () => {
  const streetBefore = street(3, 42)
  const raw = {
    ...streetBefore,
    version: 3,
    lots: Arr.map(streetBefore.lots, (lot) => ({
      ...lot,
      resident: Resident.guards.Player(lot.resident)
        ? {
            ...lot.resident,
            tools: Arr.filter(lot.resident.tools, (tool) => tool !== 'rake'),
          }
        : lot.resident,
      patches: Arr.map(lot.patches, ({ leaves: _leaves, weeds: _weeds, ...patch }) => patch),
    })),
  }
  const restored = loadBlock({ raw, now: 0 })
  if (restored === undefined) {
    throw new Error('Missing block')
  }
  expect(restored.save).toBe(true)
  expect(view(restored.block).player).toMatchObject({
    coins: 42,
    equipped: 'reel',
    lot: 3,
    tools: expect.arrayContaining(['rake']),
  })
  expect(restored.block.lots[2]?.patches[0]).toMatchObject({ weeds: 0, leaves: 0 })
  expect(loadBlock({ raw: restored.block, now: 0 })?.save).toBe(false)
})

const sweep = (block: BlockState, cell: number) => act(block, Command.cases.SweepLeaves.make({ cell }))
const launch = (block: BlockState, destination: number) => act(block, Command.cases.LaunchLeaves.make({ destination }))

it('gathers scattered leaves and sends them to a distant resident with a private return address', () => {
  const initial = equip(buy(street(6, 100), 'handheld-blower').block, 'handheld-blower')
  const friend = Option.some('friend')
  const claimed = transitionBlock({
    block: initial,
    now: 0,
    credential: friend,
    command: Command.cases.Claim.make({ lot: 3, name: 'Chris' }),
  }).block
  const block = {
    ...claimed,
    lots: Arr.map(claimed.lots, (lot) => ({
      ...lot,
      patches: Arr.map(lot.patches, (patch, index) => ({
        ...patch,
        leaves: lot.id === 6 ? 9 : index === 63 ? 100 : 0,
      })),
    })),
  }
  const result = launch(block, 3)
  expect(result).toMatchObject({
    receipt: { cost: 1, gross: 0, leafDestination: 3, leafCell: 62, leafSourceCell: 0, leafAmount: 25 },
  })
  expect(Arr.map(Arr.take(result.block.lots[5]?.patches ?? [], 3), (patch) => patch.leaves)).toEqual([0, 0, 2])
  expect(view(result.block).player).toMatchObject({ coins: 39, xp: 0 })
  expect(view(result.block).player?.lastDelivery).toBeUndefined()
  const saved = loadBlock({ raw: result.block, now: 0 })
  expect(saved?.block).toEqual(result.block)
  const received = viewBlock({ block: result.block, credential: friend })
  expect(received.player?.lastDelivery).toEqual({
    id: 1,
    sender: 'Pat',
    amount: 25,
    senderLot: 6,
    sourceCell: 0,
    landingCell: 62,
  })
  expect(received.lots[2]?.patches[62]?.leaves).toBe(25)
  expect(viewBlock({ block: launch(result.block, 3).block, credential: friend }).player?.lastDelivery?.id).toBe(2)
  expect(launch(result.block, 6)).toMatchObject({ reason: 'invalid-destination' })
  expect(launch(result.block, 200)).toMatchObject({ reason: 'invalid-destination' })
  const full = {
    ...block,
    lots: Arr.map(block.lots, (lot) =>
      lot.id === 3 ? { ...lot, patches: Arr.map(lot.patches, (patch) => ({ ...patch, leaves: 100 })) } : lot
    ),
  }
  expect(launch(full, 3)).toMatchObject({ reason: 'lawn-full', block: full })
})

it('keeps raked leaves in the shed for a winter launch and charges the sender when Karen gets the pile', () => {
  const initial = equip(street(6, 500), 'rake')
  const raked = work(initial, 6, 0, 'rake')
  expect(view(raked.block).player?.baggedLeaves).toBe(75)
  const winter = {
    ...raked.block,
    tick: seasonTicks,
    lots: Arr.map(raked.block.lots, (lot) => ({
      ...lot,
      patches: Arr.map(lot.patches, (patch) => ({ ...patch, leaves: 0 })),
    })),
  }
  expect(view(winter).season).toBe('winter')
  expect(launch(winter, 0)).toMatchObject({ reason: 'selection-mismatch' })
  const geared = equip(buy(buy(winter, 'handheld-blower').block, 'backpack-blower').block, 'backpack-blower')
  const shot = launch(geared, 0)
  expect(shot).toMatchObject({ receipt: { gross: 0, fine: 10, cost: 2, leafDestination: 0, leafAmount: 65 } })
  expect(view(shot.block)).toMatchObject({
    estateLeaves: 65,
    karenAnger: 45,
    player: { coins: 170, baggedLeaves: 10, xp: 2 },
  })
  const spent = launch(shot.block, 1)
  expect(spent).toMatchObject({ receipt: { leafAmount: 10, cost: 2 } })
  const reloaded = loadBlock({ raw: spent.block, now: 0 })
  expect(reloaded && view(reloaded.block).player?.baggedLeaves).toBe(0)
  expect(launch(spent.block, 0)).toMatchObject({ reason: 'no-leaves', block: spent.block })
  const oldSave = {
    ...geared,
    lots: Arr.map(geared.lots, (lot) => {
      if (Resident.guards.Bot(lot.resident)) {
        return lot
      }
      const { baggedLeaves: _previous, ...resident } = lot.resident
      return { ...lot, resident }
    }),
  }
  const restored = loadBlock({ raw: oldSave, now: 0 })
  expect(restored && view(restored.block).player).toMatchObject({ baggedLeaves: 25, equipped: 'backpack-blower' })
})

it('sweeps leaves into storage across a clipped blower footprint and only charges effective passes', () => {
  const initial = street(2, 500)
  expect(sweep(initial, 7)).toMatchObject({ reason: 'selection-mismatch', block: initial })
  const handheld = equip(buy(initial, 'handheld-blower').block, 'handheld-blower')
  const corner = sweep(handheld, 7)
  expect(corner).toMatchObject({ receipt: { gross: 0, cost: 1, bonus: 0, leafAmount: 200 } })
  expect(view(corner.block).player).toMatchObject({ coins: 439, baggedLeaves: 225, xp: 0 })
  const corners = corner.block.lots[1]?.patches ?? []
  expect(Arr.map([6, 7, 14, 15, 8, 16], (i) => corners[i]?.leaves)).toEqual([0, 0, 0, 0, 50, 50])
  expect(corner.block.lots[0]).toBe(handheld.lots[0])
  expect(sweep(corner.block, 7)).toMatchObject({ reason: 'no-change', block: corner.block })
  expect(sweep(handheld, 27)).toMatchObject({ receipt: { leafAmount: 450 } })
  const backpack = equip(buy(handheld, 'backpack-blower').block, 'backpack-blower')
  const interior = sweep(backpack, 27)
  expect(interior).toMatchObject({ receipt: { cost: 2, leafAmount: 1250 } })
  expect(view(interior.block).player).toMatchObject({ coins: 178, baggedLeaves: 1275, xp: 0 })
  const saved = loadBlock({ raw: interior.block, now: 0 })
  expect(saved && view(saved.block).player?.baggedLeaves).toBe(1275)
  const broke = equip(buy(street(2, 60), 'handheld-blower').block, 'handheld-blower')
  expect(sweep(broke, 27)).toMatchObject({ reason: 'insufficient-coins', block: broke })
})

const total = (state: BlockState) =>
  Arr.reduce(
    state.lots,
    0,
    (sum, lot) =>
      Arr.reduce(lot.patches, sum, (n, patch) => n + patch.leaves) +
      (Resident.guards.Player(lot.resident) ? lot.resident.baggedLeaves : 0)
  )

it('returns only the named pile, preserves other deliveries, and can volley after reload', () => {
  const friend = Option.some('friend')
  const initial = equip(buy(street(6, 150), 'handheld-blower').block, 'handheld-blower')
  const claimed = transitionBlock({
    block: initial,
    now: 0,
    credential: friend,
    command: Command.cases.Claim.make({ lot: 3, name: 'Chris' }),
  }).block
  const block = {
    ...claimed,
    lots: Arr.map(claimed.lots, (lot) => ({
      ...lot,
      patches: Arr.map(lot.patches, (patch) => ({ ...patch, leaves: 4 })),
      resident:
        lot.id === 3 && Resident.guards.Player(lot.resident)
          ? { ...lot.resident, coins: 5, tools: [...lot.resident.tools, 'handheld-blower' as const] }
          : lot.resident,
    })),
  }
  const twice = launch(launch(block, 3).block, 3).block
  const saved = loadBlock({ raw: twice, now: 0 })
  expect(saved?.block).toEqual(twice)
  if (saved === undefined) {
    throw new Error('Missing saved deliveries')
  }
  const first = view(saved.block).lots[2]?.returnPiles[0]
  const second = view(saved.block).lots[2]?.returnPiles[1]
  if (first === undefined || second === undefined) {
    throw new Error('Missing delivered piles')
  }
  expect(first).toMatchObject({ senderLot: 6, amount: 25, cell: second.cell })
  const send = Command.cases.ReturnPile.make({ id: second.id, senderLot: second.senderLot, cell: second.cell })
  const respond = (state: BlockState, command: Command) =>
    transitionBlock({ block: state, command, credential: friend, now: 0 })
  expect(respond(saved.block, send)).toMatchObject({ reason: 'selection-mismatch' })
  const ready = respond(saved.block, Command.cases.Equip.make({ tool: 'handheld-blower' })).block
  expect(act(ready, send)).toMatchObject({ reason: 'no-leaves' })
  expect(respond(ready, { ...send, senderLot: 2 })).toMatchObject({ reason: 'no-leaves' })
  const returned = respond(ready, send)
  expect(returned).toMatchObject({ receipt: { gross: 0, cost: 1, leafAmount: 25, leafDestination: 6 } })
  expect(view(returned.block).lots[2]?.returnPiles).toEqual([first])
  expect(view(returned.block).lots[2]?.patches[first.cell]?.leaves).toBe(29)
  expect(respond(returned.block, send)).toMatchObject({ reason: 'no-leaves', block: returned.block })
  const volley = view(returned.block).lots[5]?.returnPiles[0]
  if (volley === undefined) {
    throw new Error('Missing returned pile')
  }
  const again = act(returned.block, Command.cases.ReturnPile.make(volley))
  expect(again).toMatchObject({ receipt: { leafAmount: 25, leafDestination: 3 } })
  expect(view(again.block).lots[5]?.returnPiles).toEqual([])
  expect(view(again.block).lots[2]?.returnPiles).toHaveLength(2)
  expect(total(again.block)).toBe(total(block))
  const cleared = respond(again.block, Command.cases.SweepLeaves.make({ cell: first.cell })).block
  expect(view(cleared).lots[2]?.returnPiles).toEqual([])
  const raked = respond(
    respond(ready, Command.cases.Equip.make({ tool: 'rake' })).block,
    Command.cases.Work.make({ lot: 3, cell: first.cell, tool: 'rake', pattern: 'straight' })
  )
  expect(view(raked.block).lots[2]?.returnPiles).toEqual([])
  const later = view(advance(ready, seasonTicks)).lots[2]?.returnPiles
  expect(later?.[0]?.amount).toBe(24)
})
