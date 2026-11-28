// @effect-diagnostics asyncFunction:off -- Vitest advances the browser clock through its Promise API.
import { afterEach, assert, beforeEach, it, vi } from 'vitest'

import { watchUpdates } from '../src/updates.ts'

const tab = Object.assign(new EventTarget(), { visibilityState: 'visible' })
const get = vi.fn<typeof fetch>()
const notify = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  tab.visibilityState = 'visible'
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('location', new URL('https://lawnmog.example'))
  vi.stubGlobal('document', tab)
  vi.stubGlobal('fetch', get)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('checks visible tabs, throttles tab returns and announces a different build once', async () => {
  get.mockResolvedValueOnce(Response.json({ version: 'one' })).mockResolvedValueOnce(Response.json({ version: 'two' }))
  watchUpdates({ currentVersion: 'one', onUpdate: notify })
  tab.visibilityState = 'hidden'
  await vi.advanceTimersByTimeAsync(60_000)
  assert.equal(get.mock.calls.length, 0)
  tab.visibilityState = 'visible'
  tab.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(1000)
  tab.dispatchEvent(new Event('visibilitychange'))
  assert.equal(get.mock.calls.length, 1)
  assert.equal(String(get.mock.calls[0]?.[0]), 'https://lawnmog.example/version.json')
  assert.equal(get.mock.calls[0]?.[1]?.cache, 'no-store')
  assert.equal(notify.mock.calls.length, 0)
  await vi.advanceTimersByTimeAsync(120_000)
  tab.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(notify.mock.calls, [['two']])
  assert.equal(get.mock.calls.length, 2)
})

it('ignores offline, invalid, unsuccessful and development responses and retries', async () => {
  get
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response('{'))
    .mockResolvedValueOnce(Response.json({ version: 3 }))
    .mockResolvedValueOnce(Response.json({ version: 'two' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ version: 'dev' }))
    .mockResolvedValueOnce(Response.json({ version: 'two' }))
  watchUpdates({ currentVersion: 'dev', onUpdate: notify })
  await vi.advanceTimersByTimeAsync(60_000)
  assert.equal(get.mock.calls.length, 0)
  watchUpdates({ currentVersion: 'one', onUpdate: notify })
  await vi.advanceTimersByTimeAsync(300_000)
  assert.equal(notify.mock.calls.length, 0)
  await vi.advanceTimersByTimeAsync(60_000)
  assert.deepEqual(notify.mock.calls, [['two']])
})
