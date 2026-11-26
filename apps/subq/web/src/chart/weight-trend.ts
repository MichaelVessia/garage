import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { WeightTrajectoryTrendLine } from '@garage/subq-domain/WeightMath'
import { extent } from 'd3'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import {
  viewGridLines,
  viewScheduleBands,
  viewXAxis,
  viewYAxis,
  viewYLabel,
  viewZoomSelection,
  viewZoomStrips,
} from './axes.ts'
import { CHART_HEIGHT, CHART_WIDTH, PILL, bySortedDate, computePills, computeSegments } from './layout.ts'
import type { ChartFrame, InjectionPoint, SchedulePeriod, WeightPoint, ZoomRange } from './layout.ts'
import { viewDosePills, viewTooltip, viewTrendLine, viewWeightDots, viewWeightPaths } from './marks.ts'
import { linearScale, utcScale } from './scale.ts'
import { CancelledChartZoom, ClearedChartFilter, EndedChartZoom } from './state.ts'
import type { ChartMessage, ChartState } from './state.ts'

// Ported from web/src/components/stats/weight-trend-chart (React + imperative
// d3). All layout math is the same pure code; rendering is hyperscript SVG in
// a fixed 800-wide viewBox (scales responsively), tooltips are anchored at
// data coordinates instead of following the mouse, and drag-zoom uses
// per-interval hit strips instead of d3.brush. Touch long-press filtering was
// not carried over.

// ============================================
// View
// ============================================

export interface WeightTrendProps {
  readonly state: ChartState
  readonly weightData: ReadonlyArray<WeightPoint>
  readonly injectionData: ReadonlyArray<InjectionPoint>
  readonly schedulePeriods: ReadonlyArray<SchedulePeriod>
  readonly trendLine: Option.Option<WeightTrajectoryTrendLine>
  readonly zoomRange: Option.Option<ZoomRange>
  readonly displayWeight: (lbs: number) => number
  readonly unitLabel: string
  readonly timezone: IanaTimezone
}

export const viewWeightTrend = <ParentMessage>({
  h,
  props,
}: {
  readonly props: WeightTrendProps
  readonly h: Html.H<ParentMessage | ChartMessage>
}): View.Content<ParentMessage | ChartMessage> | false => {
  const {
    displayWeight,
    injectionData,
    schedulePeriods,
    state,
    timezone,
    trendLine,
    unitLabel,
    weightData,
    zoomRange,
  } = props

  const formatDate = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone }).format(date)

  const formatTick = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: timezone }).format(date)

  const allSorted = bySortedDate(weightData)

  const sorted = Option.match(zoomRange, {
    onNone: () => allSorted,
    onSome: (range) => Arr.filter(allSorted, (point) => point.date >= range.start && point.date <= range.end),
  })

  if (Arr.isReadonlyArrayEmpty(sorted)) {
    return h.div.class('text-muted-foreground h-[320px] flex items-center justify-center').children('No weight data')
  }

  const margin = { bottom: 40, left: 60, right: 30, top: 20 }
  const width = CHART_WIDTH - margin.left - margin.right
  const height = CHART_HEIGHT - margin.top - margin.bottom

  const [minDate, maxDate] = extent(sorted, (point) => point.date)
  const [minWeight, maxWeight] = extent(sorted, (point) => point.weight)

  if (minDate === undefined || maxDate === undefined || minWeight === undefined || maxWeight === undefined) {
    return false
  }

  const xScale = utcScale({ start: minDate, end: maxDate, width })
  const { maxRow, pills } = computePills(sorted, injectionData, zoomRange, xScale)
  const yPaddingBottom = (maxWeight - minWeight) * 0.1 || 5
  const pillSpace = (maxRow + 1) * (PILL.HEIGHT + PILL.VERTICAL_GAP) + 20
  const pixelsPerUnit = height / (maxWeight - minWeight + yPaddingBottom * 2 || 10)
  const yPaddingTop = pillSpace / pixelsPerUnit

  const yScale = linearScale({ min: minWeight - yPaddingBottom, max: maxWeight + yPaddingTop, height })

  const segments = computeSegments(sorted, injectionData)

  const { filter } = state

  const frame: ChartFrame = {
    displayWeight,
    domainEndMs: maxDate.getTime(),
    domainStartMs: minDate.getTime(),
    filter,
    formatDate,
    height,
    isSelected: (compound, doseMg) =>
      filter === null ||
      (Option.exists(compound, (value) => value === filter.compound) &&
        Option.exists(doseMg, (value) => value === filter.doseMg)),
    margin,
    unitLabel,
    width,
    xScale,
    yScale,
  }

  return h.div.class('relative w-full').children(
    h
      .el('svg')
      .attr('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`)
      .attr('class', 'block w-full h-auto')
      .attr('aria-label', 'Weight trend chart')
      .on('mouseup', EndedChartZoom())
      .on('mouseleave', CancelledChartZoom())
      .children(
        h
          .el('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
          .children(
            ...viewGridLines({ frame, h }),
            ...viewScheduleBands({ frame, h, schedulePeriods }),
            ...viewZoomStrips({ frame, h }),
            viewZoomSelection({ frame, h, zoomDrag: state.zoomDrag }),
            ...viewWeightPaths({ frame, h, segments }),
            ...viewTrendLine({ frame, h, trendLine }),
            ...viewWeightDots({ frame, h, segments }),
            ...viewDosePills({ frame, h, pills }),
            viewXAxis({ formatTick, frame, h }),
            viewYAxis({ frame, h }),
            viewYLabel({ frame, h })
          )
      ),
    viewTooltip({ h, tooltip: state.tooltip }),
    filter === null
      ? null
      : h.button
          .attr('type', 'button')
          .class('absolute top-2 right-2 text-xs bg-muted/80 hover:bg-muted px-2 py-1 rounded-md text-muted-foreground')
          .on('click', ClearedChartFilter())
          .children(`Clear filter: ${filter.compound} ${filter.doseMg} mg`),
    Option.isNone(zoomRange) && filter === null
      ? h.div.class('absolute bottom-2 right-2 text-xs text-muted-foreground opacity-60').children('Drag to zoom')
      : null
  )
}
