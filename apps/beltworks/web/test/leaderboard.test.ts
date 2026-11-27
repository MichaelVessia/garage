// @vitest-environment happy-dom
import { assert, it } from '@effect/vitest'
import { createRuntime, exportSave } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { vi } from 'vitest'

import layout from '../index.html?raw'
import { element } from '../src/hud.ts'
import { setupLeaderboard } from '../src/leaderboard.ts'

it.effect('lets a new player inspect a ranked factory and unlocks submission after M2', () =>
  Effect.gen(function* () {
    const template = document.createElement('template')
    template.innerHTML = layout
    template.content.querySelectorAll('link, script').forEach((node) => node.remove())
    document.body.replaceChildren(template.content)
    const current = { milestoneIndex: 1, ascensions: 0, visiting: false, revision: 1 }
    const entry = {
      callsign: 'Mint',
      ascensions: 0,
      totalCores: 0,
      milestone: 3,
      medals: 0,
      bestRunTicks: null,
      verifiedThroughput: 0,
      shareId: 'shared-factory',
      isYou: false,
    }
    const fetch = vi.fn((_url: RequestInfo | URL, options?: RequestInit) =>
      Promise.resolve(
        Response.json(
          options?.method === 'POST'
            ? { entry }
            : { foundryRank: [entry], fastestM8: [], throughput: [], totalPlayers: 1 }
        )
      )
    )
    vi.stubGlobal('fetch', fetch)
    try {
      const inspect = vi.fn(() => Promise.resolve())
      const leaderboard = setupLeaderboard({
        state: () => current,
        getSave: () => exportSave(createRuntime(0)),
        playerId: 'player-1234',
        inspect,
      })
      element('open-leaderboard').click()
      assert.isTrue(element('leaderboard-post').hasAttribute('disabled'))
      assert.equal(
        element('leaderboard-status').textContent,
        'Complete Milestone 2 (craft 3s) to join the leaderboard.'
      )
      yield* Effect.promise(() => vi.waitFor(() => assert.include(element('leaderboard-rows').textContent, 'Mint')))
      assert.lengthOf(fetch.mock.calls, 1)
      element('leaderboard-rows').querySelector('button')?.click()
      assert.deepEqual(inspect.mock.calls, [['shared-factory', 'Mint']])
      yield* Effect.promise(() => vi.waitFor(() => assert.isFalse(element('leaderboard').hasAttribute('open'))))
      element('open-leaderboard').click()
      current.milestoneIndex = 2
      leaderboard.sync()
      assert.isFalse(element('leaderboard-post').hasAttribute('disabled'))
      assert.equal(element('leaderboard-status').textContent, '')
      yield* Effect.promise(() =>
        vi.waitFor(() => assert.isTrue(Arr.some(fetch.mock.calls, ([, options]) => options?.method === 'POST')))
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
)
