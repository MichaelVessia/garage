// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Option from 'effect/Option'
import * as AsyncData from 'foldkit/asyncData'

import {
  ChangedCustomEnd,
  ChangedCustomStart,
  CommittedCustomRange,
  SucceededDeleteGoal,
  SucceededSaveGoal,
  initialStatsModel,
  rangeKey,
  syncStatsFetch,
  updateStats,
} from '../src/page/stats.js'
import type { StatsModel } from '../src/page/stats.js'

const timezone = 'America/New_York'

describe('stats page update', () => {
  it('syncStatsFetch fetches when the range key changes and dedupes otherwise', () => {
    const range = { end: Option.some('2026-07-03'), start: Option.some('2026-06-03') }
    const [loading, commands] = syncStatsFetch(initialStatsModel, range, timezone)
    expect(AsyncData.isLoading(loading.data)).toBe(true)
    expect(loading.fetchedRange).toBe(rangeKey(range))
    expect(commands).toHaveLength(1)
    expect(commands[0]?.args).toEqual({ end: '2026-07-03', start: '2026-06-03', timezone })

    const [same, none] = syncStatsFetch(loading, range, timezone)
    expect(none).toHaveLength(0)
    expect(same).toBe(loading)

    const [, refetch] = syncStatsFetch(loading, { end: Option.none(), start: Option.none() }, timezone)
    expect(refetch).toHaveLength(1)
  })

  it('custom range only navigates when both dates are set and ordered', () => {
    const base: StatsModel = { ...initialStatsModel }
    const [withStart] = updateStats(base, ChangedCustomStart({ value: '2026-07-01' }), timezone)
    const [, noNav] = updateStats(withStart, CommittedCustomRange(), timezone)
    expect(noNav).toHaveLength(0)

    const [withBoth] = updateStats(withStart, ChangedCustomEnd({ value: '2026-06-01' }), timezone)
    const [, invalid] = updateStats(withBoth, CommittedCustomRange(), timezone)
    expect(invalid).toHaveLength(0)

    const [withValid] = updateStats(withBoth, ChangedCustomEnd({ value: '2026-07-02' }), timezone)
    const [, nav] = updateStats(withValid, CommittedCustomRange(), timezone)
    expect(nav).toHaveLength(1)
  })

  it('preserves timezone when goal changes refetch the current range', () => {
    const range = { end: Option.some('2026-07-03'), start: Option.some('2026-06-03') }
    const [loading] = syncStatsFetch(initialStatsModel, range, timezone)

    const [, saveCommands] = updateStats(loading, SucceededSaveGoal(), timezone)
    const [, deleteCommands] = updateStats(loading, SucceededDeleteGoal(), timezone)

    expect(saveCommands[0]?.args).toEqual({ end: '2026-07-03', start: '2026-06-03', timezone })
    expect(deleteCommands[0]?.args).toEqual({ end: '2026-07-03', start: '2026-06-03', timezone })
  })
})
