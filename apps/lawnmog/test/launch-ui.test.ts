// @vitest-environment happy-dom
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect, it, vi } from 'vitest'

import markup from '../index.html?raw'
import { createBlock, transitionBlock, viewBlock } from '../src/block.ts'
import { Command } from '../src/model.ts'
import type { BlockView } from '../src/model.ts'
import type { createWorld } from '../src/world.ts'

const blowLeaves = vi.hoisted(() => vi.fn())
const setBlowerTargeted = vi.hoisted(() => vi.fn())
let input: Parameters<typeof createWorld>[1]

vi.mock('../src/world.ts', () => ({
  createWorld: (_host: HTMLElement, callbacks: typeof input) => {
    input = callbacks
    return Promise.resolve({
      blowLeaves,
      setBlowerTargeted,
      setBlock: vi.fn(),
      setWorkingEnabled: vi.fn(),
      setTool: vi.fn(),
      setPeers: vi.fn(),
    })
  },
}))

// @effect-diagnostics asyncFunction:off -- Operate the resident HUD with public HTTP responses.
it('keeps the chosen friend across updates and shows who sent incoming leaves', async () => {
  const page = new DOMParser().parseFromString(markup, 'text/html')
  document.body.replaceChildren(...page.body.children)
  const credential = Option.some('resident')
  const own = viewBlock({
    block: transitionBlock({
      block: createBlock(1000),
      now: 1000,
      credential,
      command: Command.cases.Claim.make({ lot: 1, name: 'Maple' }),
    }).block,
    credential,
  })
  if (own.player === null) {
    throw new Error('Missing resident')
  }
  const player = { ...own.player, equipped: 'handheld-blower' as const, coins: 10 }
  let view: BlockView = {
    ...own,
    player,
    lots: Arr.map(own.lots, (lot) => (lot.id === 5 ? { ...lot, name: 'Ash', bot: false } : lot)),
  }
  let postBody = ''
  const fetch = vi.spyOn(window, 'fetch').mockImplementation((url, options) => {
    if (url === '/api/block') {
      if (options?.body !== undefined) {
        postBody = String(options.body)
        return Promise.resolve(
          Response.json({
            ...view,
            receipt: {
              gross: 0,
              cost: 1,
              bonus: 0,
              leafSourceCell: 4,
              leafCell: 60,
              leafDestination: 7,
              leafAmount: 25,
            },
          })
        )
      }
      return Promise.resolve(Response.json(view))
    }
    return Promise.resolve(Response.json(url === '/api/block/chat' ? { messages: [] } : { peers: [] }))
  })
  vi.useFakeTimers()
  try {
    await import('../src/main.ts')
    await vi.advanceTimersByTimeAsync(0)
    const select = document.querySelector<HTMLSelectElement>('#leaf-target')!
    expect(document.getElementById('leaf-launch')?.hidden).toBe(false)
    expect(select.value).toBe('sweep')
    expect(select.options[2]?.textContent).toContain('Ash')
    input.onWork(1, 12, 'north')
    await vi.advanceTimersByTimeAsync(0)
    expect(postBody).toBe('{"_tag":"SweepLeaves","cell":12}')
    expect(select.lastElementChild?.textContent).toContain('Karen')
    expect(select.querySelector('[value="1"]')).toBeNull()
    select.value = '7'
    select.dispatchEvent(new Event('change'))
    expect(setBlowerTargeted).toHaveBeenLastCalledWith(true)
    select.focus()
    const original = select.options[0]
    select.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }))
    expect(document.querySelector('dialog')?.open).toBe(false)
    view = { ...view, weather: 'rain' }
    await vi.advanceTimersByTimeAsync(2500)
    expect(select.options[0]).toBe(original)
    expect(document.activeElement).toBe(select)
    expect(select.value).toBe('7')
    input.onLeafLaunch()
    await vi.advanceTimersByTimeAsync(0)
    expect(postBody).toBe('{"_tag":"LaunchLeaves","destination":7}')
    expect(blowLeaves).toHaveBeenCalledWith(1, 4, 7, 60, 25)
    expect(document.getElementById('notice')?.textContent).toContain('25 leaves')
    view = {
      ...view,
      player: {
        ...player,
        lastDelivery: { id: 3, sender: 'Ash', amount: 12, senderLot: 5, sourceCell: 17, landingCell: 59 },
      },
    }
    await vi.advanceTimersByTimeAsync(2500)
    expect(blowLeaves).toHaveBeenCalledWith(5, 17, 1, 59, 12)
    expect(document.getElementById('notice')?.textContent).toContain('Ash blew 12 leaves')
    input.onReturnFocus(5)
    expect(document.getElementById('hint')?.textContent).toContain('return Ash')
    input.onReturnPile(59, 5, 3)
    await vi.advanceTimersByTimeAsync(0)
    expect(Option.getOrThrow(Schema.decodeOption(Schema.fromJsonString(Command))(postBody))).toEqual(
      Command.cases.ReturnPile.make({ cell: 59, senderLot: 5, id: 3 })
    )
    expect(select.value).toBe('7')
    input.onReturnFocus(null)
    document.getElementById('shed')?.click()
    expect(document.getElementById('last-leaf-delivery')?.textContent).toContain('Ash at 105 Clover Lane')
  } finally {
    fetch.mockRestore()
    vi.useRealTimers()
  }
})
