import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import { vi } from 'vitest'

import { defaultCallsign, leaderboardSync } from '../src/leaderboardSync.ts'

it('derives stable workshop callsigns that the server accepts', () => {
  const names = new Set<string>()
  for (let index = 0; index < 256; index++) {
    const id = 'factory-' + index
    const callsign = defaultCallsign(id)
    assert.match(callsign, /^[a-zA-Z0-9 _.-]{1,16}$/u)
    assert.equal(defaultCallsign(id), callsign)
    names.add(callsign)
  }
  assert.isAbove(names.size, 1)
})

it.effect('posts active home factories, throttles periodic saves and syncs changes on demand', () =>
  Effect.gen(function* () {
    const current = { revision: 0, visiting: false, milestoneIndex: 0, ascensions: 0 }
    const post = vi.fn(() => Promise.resolve())
    const sync = leaderboardSync({ state: () => current, post })
    vi.useFakeTimers()
    try {
      yield* Effect.promise(() => sync())
      assert.lengthOf(post.mock.calls, 0)
      current.milestoneIndex = 1
      yield* Effect.promise(() => sync(true))
      assert.lengthOf(post.mock.calls, 0)
      current.milestoneIndex = 2
      yield* Effect.promise(() => sync(true))
      assert.lengthOf(post.mock.calls, 1)
      current.revision++
      yield* Effect.promise(() => sync(true))
      assert.lengthOf(post.mock.calls, 1)
      vi.advanceTimersByTime(30_000)
      yield* Effect.promise(() => sync(true))
      assert.lengthOf(post.mock.calls, 2)
      current.visiting = true
      current.revision++
      yield* Effect.promise(() => sync())
      assert.lengthOf(post.mock.calls, 2)
      current.visiting = false
      current.milestoneIndex++
      yield* Effect.promise(() => sync())
      yield* Effect.promise(() => sync())
      assert.lengthOf(post.mock.calls, 3)
      current.milestoneIndex = 0
      current.ascensions++
      current.revision++
      yield* Effect.promise(() => sync())
      assert.lengthOf(post.mock.calls, 4)
    } finally {
      vi.useRealTimers()
    }
  })
)
