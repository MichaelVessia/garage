// @vitest-environment happy-dom
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect, it, vi } from 'vitest'

import markup from '../index.html?raw'
import { createBlock, transitionBlock, viewBlock } from '../src/block.ts'
import { BlockView, Command } from '../src/model.ts'

const visitEstate = vi.hoisted(() => vi.fn())

vi.mock('../src/world.ts', () => ({
  createWorld: () =>
    Promise.resolve({
      visitEstate,
      setBlock: vi.fn(),
      setWorkingEnabled: vi.fn(),
      setBlowerTargeted: vi.fn(),
      setPeers: vi.fn(),
      setTool: vi.fn(),
    }),
}))

const content = (id: string) => document.getElementById(id)?.textContent

// @effect-diagnostics asyncFunction:off -- Operate the game HUD with public block responses.
it('shows the public deadline and distinguishes current risk from the amount deducted', async () => {
  const page = new DOMParser().parseFromString(markup, 'text/html')
  document.body.replaceChildren(...page.body.children)
  const credential = Option.some('resident')
  const initial = createBlock(1000)
  let view = viewBlock({ block: initial, credential })
  const fetch = vi.spyOn(window, 'fetch').mockImplementation((url) => {
    if (url === '/api/block') {
      return Promise.resolve(Response.json(view))
    }
    return Promise.resolve(Response.json(url === '/api/block/chat' ? { messages: [] } : { peers: [] }))
  })
  vi.useFakeTimers()
  try {
    await import('../src/main.ts')
    await vi.advanceTimersByTimeAsync(0)
    document.getElementById('neighbors')?.click()
    expect(document.getElementById('directory')?.hidden).toBe(false)
    expect(content('weather')).toMatch(/autumn/i)
    expect(content('hoa-standard')).toBe(view.hoa.standard)
    expect(content('hoa-deadline')).toContain(
      new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(view.hoa.nextInspectionAt)
    )
    expect(content('hoa-current')).toContain('Claim a lawn')
    expect(content('hoa-comment')).toContain('Karen')
    document.getElementById('visit-karen')?.click()
    expect(visitEstate).toHaveBeenCalledOnce()
    document.getElementById('neighbors')?.click()
    const claimed = viewBlock({
      block: transitionBlock({
        block: initial,
        now: 1000,
        credential,
        command: Command.cases.Claim.make({ lot: 2, name: 'Ada' }),
      }).block,
      credential,
    })
    if (claimed.player === null) {
      throw new Error('Missing resident')
    }
    view = {
      ...claimed,
      yardWinner: 2,
      nextJudgingAt: Math.floor(performance.timeOrigin + performance.now()) + 59_000,
      karenAnger: 80,
      hoa: { ...claimed.hoa, nextInspectionAt: claimed.hoa.nextInspectionAt + 360_000 },
      player: { ...claimed.player, hoa: { ...claimed.player.hoa, lastFine: 2, nextFine: 10, failures: 1 } },
      lots: Arr.map(claimed.lots, (lot) =>
        lot.id === 2 ? { ...lot, hoa: { ...lot.hoa, compliant: false, lastResult: 'cited' } } : lot
      ),
    }
    await vi.advanceTimersByTimeAsync(2500)
    expect(content('notice')).toContain('2 coins deducted')
    expect(content('judging-warning')).toContain('Judging in')
    expect(content('yard-award')).toContain('Ada · 102 Clover Lane')
    expect(content('hoa-summary')).toContain('at risk')
    expect(content('hoa-comment')).toContain('photographs')
    expect(content('hoa-current')).toContain('up to 10 coins')
    expect(content('hoa-remedy')).toBe(view.hoa.remedy)
    expect(content('hoa-result')).toContain('2 coins deducted')
    view = { ...view, lots: Arr.map(view.lots, (lot) => ({ ...lot, hoa: { ...lot.hoa, compliant: true } })) }
    await vi.advanceTimersByTimeAsync(2500)
    expect(content('hoa-current')).toContain('Meets the standard')
    expect(content('hoa-result')).toContain('2 coins deducted')
  } finally {
    fetch.mockRestore()
    vi.useRealTimers()
  }
})

it('shows existing properties during a rolling update from a street without inspection data', () => {
  const view = viewBlock({ block: createBlock(1000), credential: Option.none() })
  const { hoa: _notice, lots, ...street } = view
  const oldStreet = { ...street, lots: Arr.map(lots, ({ hoa: _reading, ...lot }) => lot) }
  const decoded = Option.getOrThrow(Schema.decodeOption(BlockView)(oldStreet))
  expect(decoded.lots).toHaveLength(lots.length)
  expect(decoded.hoa.nextInspectionAt).toBe(0)
  expect(decoded.lots[0]?.hoa.lastResult).toBe('pending')
})
