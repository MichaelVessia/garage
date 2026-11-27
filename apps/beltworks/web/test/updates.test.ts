import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, vi } from 'vitest'

import { saveAndReload, watchUpdates } from '../src/updates.ts'

const tab = Object.assign(new EventTarget(), { visibilityState: 'visible' })
const get = vi.fn<typeof fetch>()
const notify = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  tab.visibilityState = 'visible'
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('location', new URL('https://beltworks.example'))
  vi.stubGlobal('document', tab)
  vi.stubGlobal('fetch', get)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetAllMocks()
})

it.effect('checks visible tabs, throttles tab returns and announces a different build once', () =>
  Effect.gen(function* () {
    get
      .mockResolvedValueOnce(Response.json({ version: 'one' }))
      .mockResolvedValueOnce(Response.json({ version: 'two' }))
    watchUpdates({ currentVersion: 'one', onUpdate: notify })
    tab.visibilityState = 'hidden'
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(60_000))
    assert.equal(get.mock.calls.length, 0)
    tab.visibilityState = 'visible'
    tab.dispatchEvent(new Event('visibilitychange'))
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(1000))
    tab.dispatchEvent(new Event('visibilitychange'))
    assert.equal(get.mock.calls.length, 1)
    assert.equal(String(get.mock.calls[0]?.[0]), 'https://beltworks.example/version.json')
    assert.equal(get.mock.calls[0]?.[1]?.cache, 'no-store')
    assert.equal(notify.mock.calls.length, 0)
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(120_000))
    tab.dispatchEvent(new Event('visibilitychange'))
    assert.deepEqual(notify.mock.calls, [['two']])
    assert.equal(get.mock.calls.length, 2)
  })
)

it.effect('ignores offline, invalid, unsuccessful and development responses and retries', () =>
  Effect.gen(function* () {
    get
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{'))
      .mockResolvedValueOnce(Response.json({ version: 3 }))
      .mockResolvedValueOnce(Response.json({ version: 'two' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ version: 'dev' }))
      .mockResolvedValueOnce(Response.json({ version: 'two' }))
    watchUpdates({ currentVersion: 'dev', onUpdate: notify })
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(60_000))
    assert.equal(get.mock.calls.length, 0)
    watchUpdates({ currentVersion: 'one', onUpdate: notify })
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(300_000))
    assert.equal(notify.mock.calls.length, 0)
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(60_000))
    assert.deepEqual(notify.mock.calls, [['two']])
  })
)

function reloadCase(outcome: 'success' | 'offline' | 'timeout') {
  it.effect('flushes before reload with cloud result ' + outcome, () =>
    Effect.gen(function* () {
      const events: Array<string> = []
      const cloud = Promise.withResolvers<void>()
      const saved = saveAndReload({
        save: () => {
          events.push('local save')
          return cloud.promise
        },
        reload: () => events.push('reload'),
      })
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(1499))
      assert.deepEqual(events, ['local save'])
      if (outcome === 'success') {
        cloud.resolve()
      } else if (outcome === 'offline') {
        cloud.reject(new Error('offline'))
      } else {
        yield* Effect.promise(() => vi.advanceTimersByTimeAsync(1))
      }
      yield* Effect.promise(() => saved)
      assert.deepEqual(events, ['local save', 'reload'])
    })
  )
}

reloadCase('success')
reloadCase('offline')
reloadCase('timeout')
