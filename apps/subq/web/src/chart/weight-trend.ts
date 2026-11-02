import { extent, scaleLinear, scaleUtc } from 'd3'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { IanaTimezone, TrendLine } from '#shared'

import {
  viewGridLines,
  viewScheduleBands,
  viewXAxis,
  viewYAxis,
  viewYLabel,
  viewZoomSelection,
  viewZoomStrips,
} from './axes.js'
import { CHART_HEIGHT, CHART_WIDTH, PILL, bySortedDate, computePills, computeSegments } from './layout.js'
import type { ChartFrame, InjectionPoint, SchedulePeriod, WeightPoint, ZoomRange } from './layout.js'
import { viewDosePills, viewTooltip, viewTrendLine, viewWeightDots, viewWeightPaths } from './marks.js'
import { CancelledChartZoom, ClearedChartFilter, EndedChartZoom } from './state.js'
import type { ChartMessage, ChartState } from './state.js'

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
  readonly trendLine: Option.Option<TrendLine>
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
  readonly h: HtmlBuilder<ParentMessage | ChartMessage>
}): Html => {
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
    return h.div([h.Class('text-muted-foreground h-[320px] flex items-center justify-center')], ['No weight data'])
  }

  const margin = { bottom: 40, left: 60, right: 30, top: 20 }
  const width = CHART_WIDTH - margin.left - margin.right
  const height = CHART_HEIGHT - margin.top - margin.bottom

  const [minDate, maxDate] = extent(sorted, (point) => point.date)
  const [minWeight, maxWeight] = extent(sorted, (point) => point.weight)

  if (minDate === undefined || maxDate === undefined || minWeight === undefined || maxWeight === undefined) {
    return h.empty
  }

  const xScale = scaleUtc().domain([minDate, maxDate]).range([0, width])
  const { maxRow, pills } = computePills(sorted, injectionData, zoomRange, xScale)
  const yPaddingBottom = (maxWeight - minWeight) * 0.1 || 5
  const pillSpace = (maxRow + 1) * (PILL.HEIGHT + PILL.VERTICAL_GAP) + 20
  const pixelsPerUnit = height / (maxWeight - minWeight + yPaddingBottom * 2 || 10)
  const yPaddingTop = pillSpace / pixelsPerUnit

  const yScale = scaleLinear()
    .domain([minWeight - yPaddingBottom, maxWeight + yPaddingTop])
    .range([height, 0])

  const segments = computeSegments(sorted, injectionData)

  const { filter } = state

  const frame: ChartFrame = {
    displayWeight,
    domainEndMs: maxDate.getTime(),
    domainStartMs: minDate.getTime(),
    filter,
    formatDate,
    height,
    isSelected: (drug, doseMg) =>
      filter === null ||
      (Option.exists(drug, (value) => value === filter.drug) &&
        Option.exists(doseMg, (value) => value === filter.doseMg)),
    margin,
    unitLabel,
    width,
    xScale,
    yScale,
  }

  return h.div(
    [h.Class('relative w-full')],
    [
      h.svg(
        [
          h.ViewBox(`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`),
          h.Class('block w-full h-auto'),
          h.AriaLabel('Weight trend chart'),
          h.OnMouseUp(EndedChartZoom()),
          h.OnMouseLeave(CancelledChartZoom()),
        ],
        [
          h.g(
            [h.Transform(`translate(${margin.left},${margin.top})`)],
            [
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
              viewYLabel({ frame, h }),
            ]
          ),
        ]
      ),
      viewTooltip({ h, tooltip: state.tooltip }),
      filter === null
        ? h.empty
        : h.button(
            [
              h.Type('button'),
              h.Class(
                'absolute top-2 right-2 text-xs bg-muted/80 hover:bg-muted px-2 py-1 rounded-md text-muted-foreground'
              ),
              h.OnClick(ClearedChartFilter()),
            ],
            [`Clear filter: ${filter.drug} ${filter.doseMg} mg`]
          ),
      Option.isNone(zoomRange) && filter === null
        ? h.div([h.Class('absolute bottom-2 right-2 text-xs text-muted-foreground opacity-60')], ['Drag to zoom'])
        : h.empty,
    ]
  )
}
