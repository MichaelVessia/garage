import * as d3 from 'd3'
import * as Arr from 'effect/Array'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import type { TrendLine } from '#shared'

import { epochToDate } from '../lib/datetime.js'

// Ported from web/src/components/stats/weight-trend-chart (React + imperative
// d3). All layout math is the same pure code; rendering is hyperscript SVG in
// a fixed 800-wide viewBox (scales responsively), tooltips are anchored at
// data coordinates instead of following the mouse, and drag-zoom uses
// per-interval hit strips instead of d3.brush. Touch long-press filtering was
// not carried over.

// ============================================
// Data types (plain, computed from RPC results)
// ============================================

export interface WeightPoint {
  readonly date: Date
  readonly weight: number
  readonly notes: Option.Option<string>
}

export interface InjectionPoint {
  readonly date: Date
  readonly drug: string
  readonly doseMg: number
}

export interface SchedulePeriod {
  readonly scheduleName: string
  readonly drug: string
  readonly startDate: Date
  readonly endDate: Option.Option<Date>
}

// ============================================
// Colors (ported from chart-colors.ts)
// ============================================

const DOSE_COLORS: Record<string, string> = {
  '2.5': '#64748b',
  '5': '#0891b2',
  '7.5': '#0d9488',
  '10': '#059669',
  '12.5': '#7c3aed',
  '15': '#be185d',
}

const FALLBACK_COLORS = ['#0891b2', '#059669', '#7c3aed', '#be185d', '#f59e0b', '#10b981', '#6366f1', '#ec4899']

export const getDoseColor = (keyOrDose: string | number): string => {
  const key = String(keyOrDose)
  const parts = key.split('::')
  const doseMg = parts.length === 2 ? (parts[1] ?? key) : key
  const mapped = DOSE_COLORS[doseMg]
  if (mapped !== undefined) {
    return mapped
  }
  const hash = Arr.reduce(
    Array.from(key, (char) => char.codePointAt(0) ?? 0),
    0,
    (sum, code) => sum + code
  )
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#0891b2'
}

export const CHART_COLORS = ['#0891b2', '#059669', '#7c3aed', '#be185d', '#64748b', '#f59e0b', '#10b981', '#6366f1']

// ============================================
// Chart state (lives inside the stats page model)
// ============================================

const ChartTooltip = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  title: Schema.String,
  lines: Schema.Array(Schema.String),
})
type ChartTooltip = typeof ChartTooltip.Type

const DrugDoseFilter = Schema.Struct({ drug: Schema.String, doseMg: Schema.Number })
type DrugDoseFilter = typeof DrugDoseFilter.Type

const ZoomDrag = Schema.Struct({ startMs: Schema.Number, hoverMs: Schema.Number })

export const ChartState = Schema.Struct({
  tooltip: Schema.NullOr(ChartTooltip),
  filter: Schema.NullOr(DrugDoseFilter),
  zoomDrag: Schema.NullOr(ZoomDrag),
})
export type ChartState = typeof ChartState.Type

export const initialChartState: ChartState = { filter: null, tooltip: null, zoomDrag: null }

// ============================================
// Chart messages
// ============================================

export const HoveredChartTooltip = m('HoveredChartTooltip', {
  x: Schema.Number,
  y: Schema.Number,
  title: Schema.String,
  lines: Schema.Array(Schema.String),
})
export const ClearedChartTooltip = m('ClearedChartTooltip')
export const ClickedChartPill = m('ClickedChartPill', { drug: Schema.String, doseMg: Schema.Number })
export const ClearedChartFilter = m('ClearedChartFilter')
export const StartedChartZoom = m('StartedChartZoom', { ms: Schema.Number })
export const HoveredChartZoom = m('HoveredChartZoom', { ms: Schema.Number })
export const EndedChartZoom = m('EndedChartZoom')
export const CancelledChartZoom = m('CancelledChartZoom')

export const ChartMessage = Schema.Union([
  HoveredChartTooltip,
  ClearedChartTooltip,
  ClickedChartPill,
  ClearedChartFilter,
  StartedChartZoom,
  HoveredChartZoom,
  EndedChartZoom,
  CancelledChartZoom,
])
export type ChartMessage = typeof ChartMessage.Type

// Returns the new state plus a committed zoom range when a drag completes.
export const updateChart = (
  state: ChartState,
  message: ChartMessage
): readonly [ChartState, Option.Option<{ readonly startMs: number; readonly endMs: number }>] =>
  Match.value(message).pipe(
    Match.withReturnType<readonly [ChartState, Option.Option<{ readonly startMs: number; readonly endMs: number }>]>(),
    Match.tagsExhaustive({
      CancelledChartZoom: () => [evo(state, { zoomDrag: () => null }), Option.none()],
      ClearedChartFilter: () => [evo(state, { filter: () => null }), Option.none()],
      ClearedChartTooltip: () => [evo(state, { tooltip: () => null }), Option.none()],
      ClickedChartPill: ({ doseMg, drug }) => [
        evo(state, {
          filter: (filter) =>
            filter !== null && filter.drug === drug && filter.doseMg === doseMg ? null : { doseMg, drug },
          tooltip: () => null,
        }),
        Option.none(),
      ],
      EndedChartZoom: () => {
        if (state.zoomDrag === null) {
          return [state, Option.none()]
        }
        const { hoverMs, startMs } = state.zoomDrag
        const next = evo(state, { zoomDrag: () => null })
        if (Math.abs(hoverMs - startMs) < 1000 * 60 * 60 * 24) {
          return [next, Option.none()]
        }
        return [next, Option.some({ endMs: Math.max(startMs, hoverMs), startMs: Math.min(startMs, hoverMs) })]
      },
      HoveredChartTooltip: ({ lines, title, x, y }) => [
        evo(state, { tooltip: () => ({ lines, title, x, y }) }),
        Option.none(),
      ],
      HoveredChartZoom: ({ ms }) => [
        evo(state, {
          zoomDrag: (drag) => (drag === null ? null : evo(drag, { hoverMs: () => ms })),
        }),
        Option.none(),
      ],
      StartedChartZoom: ({ ms }) => [evo(state, { zoomDrag: () => ({ hoverMs: ms, startMs: ms }) }), Option.none()],
    })
  )

// ============================================
// Pure layout (ported from hooks/*)
// ============================================

const PILL = { HEIGHT: 18, MIN_GAP_X: 4, VERTICAL_GAP: 4, WIDTH: 44 } as const

const CHART_WIDTH = 800
const CHART_HEIGHT = 320

interface WeightPointColored extends WeightPoint {
  readonly color: string
  readonly drug: Option.Option<string>
  readonly doseMg: Option.Option<number>
}

interface Segment {
  readonly points: ReadonlyArray<WeightPointColored>
  readonly color: string
  readonly drug: Option.Option<string>
  readonly doseMg: Option.Option<number>
}

interface Pill {
  readonly drug: string
  readonly doseMg: number
  readonly color: string
  readonly date: Date
  readonly weight: number
  readonly x: number
  readonly row: number
}

const bySortedDate = <T extends { readonly date: Date }>(items: ReadonlyArray<T>): Array<T> =>
  [...items].toSorted((a, b) => a.date.getTime() - b.date.getTime())

interface SegmentBuild {
  readonly segments: ReadonlyArray<Segment>
  readonly current: ReadonlyArray<WeightPointColored>
  readonly color: string
  readonly drug: Option.Option<string>
  readonly doseMg: Option.Option<number>
}

const flushSegment = (build: SegmentBuild): ReadonlyArray<Segment> =>
  Arr.isReadonlyArrayNonEmpty(build.current)
    ? [...build.segments, { color: build.color, doseMg: build.doseMg, drug: build.drug, points: build.current }]
    : build.segments

const computeSegments = (
  weightData: ReadonlyArray<WeightPoint>,
  injectionData: ReadonlyArray<InjectionPoint>
): ReadonlyArray<Segment> => {
  const sortedWeight = bySortedDate(weightData)
  const sortedInjections = bySortedDate(injectionData)
  const colored: ReadonlyArray<WeightPointColored> = sortedWeight.map((point) => {
    const recent = Option.fromNullishOr(sortedInjections.findLast((inj) => inj.date.getTime() <= point.date.getTime()))
    return {
      ...point,
      color: Option.match(recent, {
        onNone: () => '#94a3b8',
        onSome: (inj) => getDoseColor(`${inj.drug}::${inj.doseMg}`),
      }),
      doseMg: Option.map(recent, (inj) => inj.doseMg),
      drug: Option.map(recent, (inj) => inj.drug),
    }
  })
  const initial: SegmentBuild = { color: '', current: [], doseMg: Option.none(), drug: Option.none(), segments: [] }
  const built = Arr.reduce(colored, initial, (build, point) => {
    if (point.color === build.color) {
      return { ...build, current: [...build.current, point] }
    }
    const seed = Arr.isReadonlyArrayNonEmpty(build.current) ? [Arr.lastNonEmpty(build.current), point] : [point]
    return { color: point.color, current: seed, doseMg: point.doseMg, drug: point.drug, segments: flushSegment(build) }
  })
  return flushSegment(built)
}

const firstFreeRow = (occupied: HashSet.HashSet<number>, row: number): number =>
  HashSet.has(occupied, row) ? firstFreeRow(occupied, row + 1) : row

const computePills = (
  sortedWeight: ReadonlyArray<WeightPoint>,
  allInjections: ReadonlyArray<InjectionPoint>,
  zoom: Option.Option<{ readonly start: Date; readonly end: Date }>,
  xScale: d3.ScaleTime<number, number>
): { readonly pills: ReadonlyArray<Pill>; readonly maxRow: number } => {
  const sortedInjections = bySortedDate(allInjections)
  const visible = Option.match(zoom, {
    onNone: () => sortedInjections,
    onSome: (range) => sortedInjections.filter((inj) => inj.date >= range.start && inj.date <= range.end),
  })
  const closestWeight = (date: Date): Option.Option<WeightPoint> =>
    Arr.reduce(sortedWeight, Option.none<WeightPoint>(), (closest, point) =>
      Option.match(closest, {
        onNone: () => Option.some(point),
        onSome: (current) =>
          Math.abs(point.date.getTime() - date.getTime()) < Math.abs(current.date.getTime() - date.getTime())
            ? Option.some(point)
            : closest,
      })
    )
  const priorPills: ReadonlyArray<Pill> = Option.match(zoom, {
    onNone: () => [],
    onSome: (range) =>
      Option.all([
        Option.fromNullishOr(sortedInjections.findLast((inj) => inj.date < range.start)),
        Arr.head(sortedWeight),
      ]).pipe(
        Option.match({
          onNone: () => [],
          onSome: ([prior, first]) => [
            {
              color: getDoseColor(prior.doseMg),
              date: range.start,
              doseMg: prior.doseMg,
              drug: prior.drug,
              row: 0,
              weight: first.weight,
              x: xScale(range.start),
            },
          ],
        })
      ),
  })
  const initialDose = Arr.head(priorPills).pipe(
    Option.map((pill) => pill.doseMg),
    Option.getOrNull
  )
  const [domainStart, domainEnd] = xScale.domain()
  const built = Arr.reduce(visible, { pills: priorPills, prevDose: initialDose }, (acc, inj) => {
    const outOfDomain =
      domainStart !== undefined && domainEnd !== undefined && (inj.date < domainStart || inj.date > domainEnd)
    if (outOfDomain || inj.doseMg === acc.prevDose) {
      return acc
    }
    const pills = Option.match(closestWeight(inj.date), {
      onNone: () => acc.pills,
      onSome: (near) => [
        ...acc.pills,
        {
          color: getDoseColor(inj.doseMg),
          date: inj.date,
          doseMg: inj.doseMg,
          drug: inj.drug,
          row: 0,
          weight: near.weight,
          x: xScale(inj.date),
        },
      ],
    })
    return { pills, prevDose: inj.doseMg }
  })
  const placementInitial: { readonly maxRow: number; readonly placed: ReadonlyArray<Pill> } = { maxRow: 0, placed: [] }
  const placement = Arr.reduce(built.pills, placementInitial, (acc, pill) => {
    const occupied = HashSet.fromIterable(
      acc.placed.filter((prev) => Math.abs(pill.x - prev.x) < PILL.WIDTH + PILL.MIN_GAP_X).map((prev) => prev.row)
    )
    const row = firstFreeRow(occupied, 0)
    return { maxRow: Math.max(acc.maxRow, row), placed: [...acc.placed, { ...pill, row }] }
  })
  return { maxRow: placement.maxRow, pills: placement.placed }
}

// ============================================
// View
// ============================================

export interface WeightTrendProps {
  readonly state: ChartState
  readonly weightData: ReadonlyArray<WeightPoint>
  readonly injectionData: ReadonlyArray<InjectionPoint>
  readonly schedulePeriods: ReadonlyArray<SchedulePeriod>
  readonly trendLine: Option.Option<TrendLine>
  readonly zoomRange: Option.Option<{ readonly start: Date; readonly end: Date }>
  readonly displayWeight: (lbs: number) => number
  readonly unitLabel: string
}

const h = html<ChartMessage>()

const formatDate = d3.timeFormat('%b %d, %Y')
const formatTick = d3.timeFormat('%b %d')

export const viewWeightTrend = (props: WeightTrendProps) => {
  const { displayWeight, injectionData, schedulePeriods, state, trendLine, unitLabel, weightData, zoomRange } = props
  const allSorted = bySortedDate(weightData)
  const sorted = Option.match(zoomRange, {
    onNone: () => allSorted,
    onSome: (range) => allSorted.filter((point) => point.date >= range.start && point.date <= range.end),
  })
  if (Arr.isReadonlyArrayEmpty(sorted)) {
    return h.div([h.Class('text-muted-foreground h-[320px] flex items-center justify-center')], ['No weight data'])
  }

  const margin = { bottom: 40, left: 60, right: 30, top: 20 }
  const width = CHART_WIDTH - margin.left - margin.right
  const height = CHART_HEIGHT - margin.top - margin.bottom

  const [minDate, maxDate] = d3.extent(sorted, (point) => point.date)
  const [minWeight, maxWeight] = d3.extent(sorted, (point) => point.weight)
  if (minDate === undefined || maxDate === undefined || minWeight === undefined || maxWeight === undefined) {
    return h.empty
  }

  const xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, width])
  const { maxRow, pills } = computePills(sorted, injectionData, zoomRange, xScale)
  const yPaddingBottom = (maxWeight - minWeight) * 0.1 || 5
  const pillSpace = (maxRow + 1) * (PILL.HEIGHT + PILL.VERTICAL_GAP) + 20
  const pixelsPerUnit = height / (maxWeight - minWeight + yPaddingBottom * 2 || 10)
  const yPaddingTop = pillSpace / pixelsPerUnit
  const yScale = d3
    .scaleLinear()
    .domain([minWeight - yPaddingBottom, maxWeight + yPaddingTop])
    .range([height, 0])

  const segments = computeSegments(sorted, injectionData)
  const line = d3
    .line<WeightPointColored>()
    .x((point) => xScale(point.date))
    .y((point) => yScale(point.weight))
    .curve(d3.curveMonotoneX)

  const { filter } = state
  const isSelected = (drug: Option.Option<string>, doseMg: Option.Option<number>): boolean =>
    filter === null ||
    (Option.exists(drug, (value) => value === filter.drug) && Option.exists(doseMg, (value) => value === filter.doseMg))

  const attr = h.Attribute

  // Grid + axes ticks
  const yTicks = yScale.ticks(5)
  const xTicks = xScale.ticks(5)

  const gridLines = yTicks.map((tick) =>
    h.line(
      [
        attr('x1', '0'),
        attr('x2', String(width)),
        attr('y1', String(yScale(tick))),
        attr('y2', String(yScale(tick))),
        h.Stroke('currentColor'),
        h.Opacity('0.08'),
      ],
      []
    )
  )

  const xAxis = h.g(
    [h.Transform(`translate(0,${height})`)],
    [
      h.line([attr('x1', '0'), attr('x2', String(width)), h.Stroke('#e5e7eb')], []),
      ...xTicks.map((tick) =>
        h.g(
          [h.Transform(`translate(${xScale(tick)},0)`)],
          [
            h.line([attr('y2', '6'), h.Stroke('#e5e7eb')], []),
            h.text(
              [attr('y', '20'), h.TextAnchor('middle'), h.Fill('#9ca3af'), h.FontSize('11px')],
              [formatTick(tick)]
            ),
          ]
        )
      ),
    ]
  )

  const yAxis = h.g(
    [],
    yTicks.map((tick) =>
      h.text(
        [
          attr('x', '-8'),
          attr('y', String(yScale(tick) + 3)),
          h.TextAnchor('end'),
          h.Fill('#9ca3af'),
          h.FontSize('11px'),
        ],
        [String(Math.round(displayWeight(tick) * 10) / 10)]
      )
    )
  )

  const yLabel = h.text(
    [
      h.Transform('rotate(-90)'),
      attr('y', '-40'),
      attr('x', String(-height / 2)),
      h.TextAnchor('middle'),
      h.Fill('#9ca3af'),
      h.FontSize('11px'),
    ],
    [`Weight (${unitLabel})`]
  )

  // Schedule bands
  const domainStartMs = minDate.getTime()
  const domainEndMs = maxDate.getTime()
  const bands = schedulePeriods.flatMap((schedule) => {
    const endMs = Option.match(schedule.endDate, { onNone: () => domainEndMs, onSome: (date) => date.getTime() })
    const startMs = schedule.startDate.getTime()
    if (endMs < domainStartMs || startMs > domainEndMs) {
      return []
    }
    const x1 = xScale(epochToDate(Math.max(startMs, domainStartMs)))
    const x2 = xScale(epochToDate(Math.min(endMs, domainEndMs)))
    if (x2 - x1 < 2) {
      return []
    }
    return [
      h.rect(
        [
          attr('x', String(x1)),
          attr('y', '0'),
          h.Width(String(x2 - x1)),
          h.Height(String(height)),
          h.Fill('currentColor'),
          h.Opacity('0.04'),
          h.OnMouseEnter(
            HoveredChartTooltip({
              lines: [
                `${formatDate(schedule.startDate)} — ${Option.match(schedule.endDate, {
                  onNone: () => 'ongoing',
                  onSome: (date) => formatDate(date),
                })}`,
              ],
              title: `${schedule.scheduleName} (${schedule.drug})`,
              x: margin.left + (x1 + x2) / 2,
              y: margin.top + 24,
            })
          ),
          h.OnMouseLeave(ClearedChartTooltip()),
        ],
        []
      ),
    ]
  })

  // Zoom hit strips: one per x-axis day-ish interval (60 strips)
  const STRIPS = 60
  const stripWidth = width / STRIPS
  const msPerStrip = (domainEndMs - domainStartMs) / STRIPS
  const zoomStrips = Array.from({ length: STRIPS }, (_, index) => {
    const ms = domainStartMs + msPerStrip * (index + 0.5)
    return h.rect(
      [
        attr('x', String(index * stripWidth)),
        attr('y', '0'),
        h.Width(String(stripWidth)),
        h.Height(String(height)),
        h.Fill('transparent'),
        h.OnMouseDown(StartedChartZoom({ ms })),
        h.OnMouseEnter(HoveredChartZoom({ ms })),
      ],
      []
    )
  })

  const zoomSelection =
    state.zoomDrag === null
      ? h.empty
      : h.rect(
          [
            attr(
              'x',
              String(Math.min(xScale(epochToDate(state.zoomDrag.startMs)), xScale(epochToDate(state.zoomDrag.hoverMs))))
            ),
            attr('y', '0'),
            h.Width(
              String(
                Math.abs(xScale(epochToDate(state.zoomDrag.hoverMs)) - xScale(epochToDate(state.zoomDrag.startMs)))
              )
            ),
            h.Height(String(height)),
            h.Fill('currentColor'),
            h.Opacity('0.1'),
            h.Stroke('currentColor'),
            h.StrokeOpacity('0.3'),
            h.Rx('3'),
            h.PointerEvents('none'),
          ],
          []
        )

  // Weight line segments
  const paths = segments.flatMap((segment) => {
    if (segment.points.length < 2) {
      return []
    }
    const d = line([...segment.points])
    if (d === null) {
      return []
    }
    const selected = isSelected(segment.drug, segment.doseMg)
    return [
      h.path(
        [
          attr('d', d),
          h.Fill('none'),
          h.Stroke(segment.color),
          h.StrokeWidth(selected ? '2' : '1'),
          h.Opacity(selected ? '1' : '0.15'),
          h.PointerEvents('none'),
        ],
        []
      ),
    ]
  })

  // Trend line
  const trendElements = Option.match(trendLine, {
    onNone: (): ReadonlyArray<ReturnType<typeof h.line>> => [],
    onSome: (trend) => {
      const y1 = yScale(trend.slope * domainStartMs + trend.intercept)
      const y2 = yScale(trend.slope * domainEndMs + trend.intercept)
      const lbsPerWeek = trend.slope * 7 * 24 * 60 * 60 * 1000
      const ratePerWeek = displayWeight(Math.abs(lbsPerWeek))
      const rateText =
        Math.abs(lbsPerWeek) <= 0.01
          ? 'Maintaining weight'
          : `${lbsPerWeek > 0 ? '+' : '-'}${ratePerWeek.toFixed(2)} ${unitLabel}/week`
      return [
        h.line(
          [
            attr('x1', '0'),
            attr('y1', String(y1)),
            attr('x2', String(width)),
            attr('y2', String(y2)),
            h.Stroke('transparent'),
            h.StrokeWidth('12'),
            h.Cursor('pointer'),
            h.OnMouseEnter(
              HoveredChartTooltip({
                lines: [
                  rateText,
                  `${displayWeight(trend.startWeight).toFixed(1)} → ${displayWeight(trend.endWeight).toFixed(1)} ${unitLabel}`,
                ],
                title: 'Trend Line',
                x: margin.left + width / 2,
                y: margin.top + (y1 + y2) / 2,
              })
            ),
            h.OnMouseLeave(ClearedChartTooltip()),
          ],
          []
        ),
        h.line(
          [
            attr('x1', '0'),
            attr('y1', String(y1)),
            attr('x2', String(width)),
            attr('y2', String(y2)),
            h.Stroke('var(--foreground)'),
            h.StrokeWidth('2'),
            h.StrokeDasharray('8,4'),
            h.Opacity(filter === null ? '0.7' : '0.4'),
            h.PointerEvents('none'),
          ],
          []
        ),
      ]
    },
  })

  // Weight dots
  const dots = segments
    .flatMap((segment) => segment.points)
    .map((point) => {
      const selected = isSelected(point.drug, point.doseMg)
      const cx = xScale(point.date)
      const cy = yScale(point.weight)
      const noteLines = point.notes.pipe(
        Option.filter((note) => note !== ''),
        Option.toArray
      )
      return h.circle(
        [
          h.Cx(String(cx)),
          h.Cy(String(cy)),
          attr('r', selected ? '4' : '2'),
          h.Fill(point.color),
          h.Stroke('var(--card)'),
          h.StrokeWidth(selected ? '2' : '1'),
          h.Opacity(selected ? '1' : '0.15'),
          h.Cursor('pointer'),
          h.AriaLabel(`${displayWeight(point.weight).toFixed(1)} ${unitLabel} on ${formatDate(point.date)}`),
          h.OnMouseEnter(
            HoveredChartTooltip({
              lines: [formatDate(point.date), ...noteLines],
              title: `${displayWeight(point.weight).toFixed(1)} ${unitLabel}`,
              x: margin.left + cx,
              y: margin.top + cy,
            })
          ),
          h.OnMouseLeave(ClearedChartTooltip()),
        ],
        []
      )
    })

  // Dose pills
  const rowOffset = (row: number): number => row * (PILL.HEIGHT + PILL.VERTICAL_GAP)
  const pillElements = pills.flatMap((pill) => {
    const selected = filter === null || (pill.drug === filter.drug && pill.doseMg === filter.doseMg)
    const px = Math.max(PILL.WIDTH / 2, pill.x)
    const py = 12 + rowOffset(pill.row)
    return [
      h.line(
        [
          attr('x1', String(px)),
          attr('x2', String(px)),
          attr('y1', String(20 + rowOffset(pill.row))),
          attr('y2', String(yScale(pill.weight))),
          h.Stroke(pill.color),
          h.StrokeWidth('1'),
          h.StrokeDasharray('3,3'),
          h.Opacity(selected ? '0.4' : '0.1'),
          h.PointerEvents('none'),
        ],
        []
      ),
      h.g(
        [
          h.Transform(`translate(${px},${py})`),
          h.Cursor('pointer'),
          h.AriaLabel(`${pill.drug} ${pill.doseMg} mg on ${formatDate(pill.date)}`),
          h.OnClick(ClickedChartPill({ doseMg: pill.doseMg, drug: pill.drug })),
          h.OnMouseEnter(
            HoveredChartTooltip({
              lines: [formatDate(pill.date), ...(filter === null ? ['Click to filter'] : [])],
              title: `${pill.drug} ${pill.doseMg} mg`,
              x: margin.left + px,
              y: margin.top + py,
            })
          ),
          h.OnMouseLeave(ClearedChartTooltip()),
        ],
        [
          h.rect(
            [
              h.Rx('10'),
              h.Ry('10'),
              attr('x', String(-PILL.WIDTH / 2)),
              attr('y', '-10'),
              h.Width(String(PILL.WIDTH)),
              h.Height(String(PILL.HEIGHT)),
              h.Fill(pill.color),
              h.Opacity(selected ? '1' : '0.25'),
            ],
            []
          ),
          h.text(
            [h.TextAnchor('middle'), h.Dy('0.3em'), h.Fill('#fff'), h.FontSize('10px'), h.FontWeight('600')],
            [`${pill.doseMg} mg`]
          ),
        ]
      ),
    ]
  })

  const tooltip =
    state.tooltip === null
      ? h.empty
      : h.div(
          [
            h.Class(
              'absolute bg-foreground text-background px-3.5 py-2.5 rounded-md text-xs leading-relaxed pointer-events-none z-50 max-w-[220px] shadow-md -translate-x-1/2 -translate-y-full'
            ),
            h.Style({
              left: `${((state.tooltip.x / CHART_WIDTH) * 100).toFixed(2)}%`,
              top: `calc(${((state.tooltip.y / CHART_HEIGHT) * 100).toFixed(2)}% - 10px)`,
            }),
          ],
          [
            h.div([h.Class('font-semibold mb-0.5')], [state.tooltip.title]),
            ...state.tooltip.lines.map((text) => h.div([h.Class('opacity-70')], [text])),
          ]
        )

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
              ...gridLines,
              ...bands,
              ...zoomStrips,
              zoomSelection,
              ...paths,
              ...trendElements,
              ...dots,
              ...pillElements,
              xAxis,
              yAxis,
              yLabel,
            ]
          ),
        ]
      ),
      tooltip,
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
