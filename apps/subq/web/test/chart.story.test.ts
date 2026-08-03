// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Option from 'effect/Option'

import {
  CancelledChartZoom,
  ClearedChartFilter,
  ClearedChartTooltip,
  ClickedChartPill,
  EndedChartZoom,
  HoveredChartTooltip,
  HoveredChartZoom,
  StartedChartZoom,
  initialChartState,
  updateChart,
} from '../src/chart/weight-trend.js'

const DAY = 24 * 60 * 60 * 1000

describe('weight trend chart state', () => {
  it('pill click sets the filter and clicking the same pill clears it', () => {
    const [filtered] = updateChart(initialChartState, ClickedChartPill({ doseMg: 5, drug: 'Sema' }))
    expect(filtered.filter).toEqual({ doseMg: 5, drug: 'Sema' })

    const [cleared] = updateChart(filtered, ClickedChartPill({ doseMg: 5, drug: 'Sema' }))
    expect(cleared.filter).toBeNull()

    const [switched] = updateChart(filtered, ClickedChartPill({ doseMg: 10, drug: 'Sema' }))
    expect(switched.filter).toEqual({ doseMg: 10, drug: 'Sema' })

    const [explicitClear] = updateChart(filtered, ClearedChartFilter())
    expect(explicitClear.filter).toBeNull()
  })

  it('tooltip hover and clear', () => {
    const [shown] = updateChart(
      initialChartState,
      HoveredChartTooltip({ lines: ['Jul 1, 2026'], title: '185.5 lbs', x: 100, y: 50 })
    )
    expect(shown.tooltip?.title).toBe('185.5 lbs')

    const [hidden] = updateChart(shown, ClearedChartTooltip())
    expect(hidden.tooltip).toBeNull()
  })

  it('a drag across more than a day commits a normalized zoom range', () => {
    const start = 100 * DAY
    const [dragging] = updateChart(initialChartState, StartedChartZoom({ ms: start }))
    expect(dragging.zoomDrag).toEqual({ hoverMs: start, startMs: start })

    // dragging leftwards (hover before start) still commits min..max
    const [hovered] = updateChart(dragging, HoveredChartZoom({ ms: start - 5 * DAY }))
    const [done, zoom] = updateChart(hovered, EndedChartZoom())
    expect(done.zoomDrag).toBeNull()
    expect(zoom).toEqual(Option.some({ endMs: start, startMs: start - 5 * DAY }))
  })

  it('a sub-day drag is treated as a click and does not zoom', () => {
    const start = 100 * DAY
    const [dragging] = updateChart(initialChartState, StartedChartZoom({ ms: start }))
    const [hovered] = updateChart(dragging, HoveredChartZoom({ ms: start + DAY / 2 }))
    const [done, zoom] = updateChart(hovered, EndedChartZoom())
    expect(done.zoomDrag).toBeNull()
    expect(Option.isNone(zoom)).toBe(true)
  })

  it('hover without an active drag does not start one', () => {
    const [state] = updateChart(initialChartState, HoveredChartZoom({ ms: 5 * DAY }))
    expect(state.zoomDrag).toBeNull()
  })

  it('leaving the chart cancels an in-progress drag', () => {
    const [dragging] = updateChart(initialChartState, StartedChartZoom({ ms: 100 * DAY }))
    const [cancelled] = updateChart(dragging, CancelledChartZoom())
    expect(cancelled.zoomDrag).toBeNull()

    const [after, zoom] = updateChart(cancelled, EndedChartZoom())
    expect(after.zoomDrag).toBeNull()
    expect(Option.isNone(zoom)).toBe(true)
  })
})
