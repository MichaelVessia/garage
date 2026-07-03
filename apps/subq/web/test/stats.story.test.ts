// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Option from 'effect/Option'
import * as AsyncData from 'foldkit/asyncData'

import {
  ChangedCustomEnd,
  ChangedCustomStart,
  CommittedCustomRange,
  initialStatsModel,
  rangeKey,
  syncStatsFetch,
  updateStats,
} from '../src/page/stats.js'
import type { StatsModel } from '../src/page/stats.js'

describe('stats page update', () => {
  it('syncStatsFetch fetches when the range key changes and dedupes otherwise', () => {
    const range = { end: Option.some('2026-07-03'), start: Option.some('2026-06-03') }
    const [loading, commands] = syncStatsFetch(initialStatsModel, range)
    expect(AsyncData.isLoading(loading.data)).toBe(true)
    expect(loading.fetchedRange).toBe(rangeKey(range))
    expect(commands).toHaveLength(1)

    const [same, none] = syncStatsFetch(loading, range)
    expect(none).toHaveLength(0)
    expect(same).toBe(loading)

    const [, refetch] = syncStatsFetch(loading, { end: Option.none(), start: Option.none() })
    expect(refetch).toHaveLength(1)
  })

  it('custom range only navigates when both dates are set and ordered', () => {
    const base: StatsModel = { ...initialStatsModel }
    const [withStart] = updateStats(base, ChangedCustomStart({ value: '2026-07-01' }))
    const [, noNav] = updateStats(withStart, CommittedCustomRange())
    expect(noNav).toHaveLength(0)

    const [withBoth] = updateStats(withStart, ChangedCustomEnd({ value: '2026-06-01' }))
    const [, invalid] = updateStats(withBoth, CommittedCustomRange())
    expect(invalid).toHaveLength(0)

    const [withValid] = updateStats(withBoth, ChangedCustomEnd({ value: '2026-07-02' }))
    const [, nav] = updateStats(withValid, CommittedCustomRange())
    expect(nav).toHaveLength(1)
  })
})
