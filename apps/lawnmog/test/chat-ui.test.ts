// @vitest-environment happy-dom
import * as Option from 'effect/Option'
import { expect, it, vi } from 'vitest'

import markup from '../index.html?raw'
import { createBlock, transitionBlock, viewBlock } from '../src/block.ts'
import { Command } from '../src/model.ts'

const world = vi.hoisted(() => ({
  setBlock: vi.fn(),
  setPeers: vi.fn(),
  setTool: vi.fn(),
  setWorkingEnabled: vi.fn(),
  setBlowerTargeted: vi.fn(),
  toggleCamera: vi.fn(),
}))
vi.mock('../src/world.ts', () => ({ createWorld: () => Promise.resolve(world) }))

const key = (target: HTMLElement, key: string, code: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }))

// @effect-diagnostics asyncFunction:off -- Start the game with an HTTP fixture and operate the actual HUD.
it('shows live chat during play and isolates game controls while reading or typing', async () => {
  const page = new DOMParser().parseFromString(markup, 'text/html')
  document.body.replaceChildren(page.querySelector('main')!)
  const stage = document.querySelector<HTMLElement>('#stage')!
  const input = document.querySelector<HTMLInputElement>('#chat-text')!
  const form = document.querySelector<HTMLFormElement>('#chat-form')!
  const log = document.querySelector<HTMLElement>('#chat-log')!
  const dialog = document.querySelector<HTMLDialogElement>('#panel')!
  const button = document.querySelector<HTMLButtonElement>('#chat-button')!
  const close = document.querySelector<HTMLButtonElement>('#chat-close')!
  const credential = Option.some('resident')
  const initial = createBlock(1000)
  let view = viewBlock({ block: initial, credential })
  vi.useFakeTimers()
  const now = Math.floor(performance.timeOrigin + performance.now())
  const first = { id: 1, lot: 1, name: 'Lee', text: 'Hello', time: now }
  const messages = [first]
  const posts: Array<RequestInit['body']> = []
  const fetch = vi.spyOn(window, 'fetch').mockImplementation((url, options) => {
    if (url === '/api/block/chat') {
      if (options?.method === 'POST') {
        posts.push(options.body)
        messages.push({ ...first, id: 3, text: 'Welcome' })
      }
      return Promise.resolve(Response.json({ messages }))
    }
    return Promise.resolve(Response.json(url === '/api/block' ? view : { peers: [] }))
  })
  try {
    await import('../src/main.ts')
    await vi.advanceTimersByTimeAsync(0)
    expect(dialog.contains(log)).toBe(false)
    expect(log.textContent).toContain('Lee · 101 Clover Lane Hello')
    button.click()
    expect(log).toBe(document.activeElement)
    expect(form.hidden).toBe(true)
    expect(document.body.textContent).toContain('Claim a lawn to send messages.')
    close.click()
    const claim = Command.cases.Claim.make({ lot: 2, name: 'Ada' })
    view = viewBlock({
      block: transitionBlock({ block: initial, now: 1000, credential, command: claim }).block,
      credential,
    })
    await vi.advanceTimersByTimeAsync(2500)
    for (const [shortcut, code] of [
      ['Enter', 'Enter'],
      ['t', 'KeyT'],
    ] as const) {
      key(stage, shortcut, code)
      expect(dialog.open).toBe(false)
      expect(stage.inert).toBe(true)
      expect(input).toBe(document.activeElement)
      key(input, 'v', 'KeyV')
      key(input, 'b', 'KeyB')
      expect(dialog.open).toBe(false)
      expect(world.toggleCamera).not.toHaveBeenCalled()
      input.value = 'Discard this'
      key(input, 'Escape', 'Escape')
      expect(input.value).toBe('')
      expect(stage.inert).toBe(false)
      expect(stage).toBe(document.activeElement)
    }
    expect(posts).toHaveLength(0)
    button.click()
    Object.defineProperties(log, { scrollHeight: { value: 400 }, clientHeight: { value: 100 } })
    log.scrollTop = 300
    key(input, 'PageUp', 'PageUp')
    expect(log.scrollTop).toBe(200)
    messages.push({ ...first, id: 2, text: 'Still here' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(log.textContent).toContain('Still here')
    expect(log.scrollTop).toBe(200)
    input.value = 'Welcome'
    form.requestSubmit()
    await vi.advanceTimersByTimeAsync(0)
    expect(posts).toEqual(['{"text":"Welcome"}'])
    expect(form.hidden).toBe(true)
    expect(stage).toBe(document.activeElement)
    expect(world.setWorkingEnabled).toHaveBeenLastCalledWith(true)
    expect(log.textContent).toContain('Welcome')
    messages.push({ ...first, id: 4, time: now - 3_600_000 + 14_500, text: 'See you on the street' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(log.textContent).toContain('See you on the street')
    messages.splice(0, 3)
    await vi.advanceTimersByTimeAsync(3000)
    expect(log.textContent).not.toContain('Welcome')
    await vi.advanceTimersByTimeAsync(3000)
    expect(log.children).toHaveLength(0)
  } finally {
    fetch.mockRestore()
    vi.useRealTimers()
  }
})
