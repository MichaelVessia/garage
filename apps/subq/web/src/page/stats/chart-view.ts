import { arc, curveStepAfter, extent, line, pie, scaleLinear, scaleUtc } from 'd3'
import type { PieArcDatum } from 'd3'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { DoseHistoryStats, IanaTimezone } from '#shared'

import { CHART_COLORS, getDoseColor } from '../../chart/colors.js'

type ChartDatum = readonly [string, number]

interface DosePoint {
  readonly date: Date
  readonly drug: string
  readonly doseMg: number
  readonly color: string
}

interface DoseSegment {
  readonly points: ReadonlyArray<DosePoint>
  readonly color: string
}

interface DoseSegmentBuild {
  readonly segments: ReadonlyArray<DoseSegment>
  readonly current: ReadonlyArray<DosePoint>
  readonly color: string
}

const flushDoseSegment = (build: DoseSegmentBuild): ReadonlyArray<DoseSegment> =>
  Arr.isReadonlyArrayNonEmpty(build.current)
    ? [...build.segments, { color: build.color, points: build.current }]
    : build.segments

const chartColor = (index: number): string => CHART_COLORS[index % CHART_COLORS.length] ?? '#0891b2'

// ---- Pie chart (pure SVG, replaces recharts SimplePieChart) ----

export const viewPieChart = <Message>({
  h,
  data,
}: {
  readonly h: HtmlBuilder<Message>
  readonly data: ReadonlyArray<ChartDatum>
}): Html => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div([h.Class('text-muted-foreground h-[200px] flex items-center justify-center')], ['No data available'])
  }

  // d3's pie generator method, not Array#sort — null disables slice reordering
  // oxlint-disable-next-line effect/prefer-arr-sort
  const pieLayout = pie<ChartDatum>()
    .value(([, value]) => value)
    .padAngle(0.035)
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort(null)

  const sliceArc = arc<PieArcDatum<ChartDatum>>().innerRadius(50).outerRadius(80)
  const labelArc = arc<PieArcDatum<ChartDatum>>().innerRadius(65).outerRadius(65)
  const arcs = pieLayout([...data])
  const attr = h.Attribute

  return h.div(
    [h.Class('flex items-center justify-center gap-6 h-[250px]')],
    [
      h.svg(
        [h.ViewBox('-90 -90 180 180'), h.Class('h-[180px] w-[180px] shrink-0')],
        Arr.map(arcs, (slice, index) => {
          const d = sliceArc(slice)
          const [lx, ly] = labelArc.centroid(slice)

          return h.g(
            [],
            [
              d === null
                ? h.empty
                : h.path([attr('d', d), h.Fill(chartColor(index)), h.Stroke('var(--card)'), h.StrokeWidth('2')], []),
              slice.data[1] > 0
                ? h.text(
                    [
                      attr('x', String(lx)),
                      attr('y', String(ly)),
                      h.TextAnchor('middle'),
                      h.Dy('0.35em'),
                      h.Fill('#fff'),
                      h.FontSize('11px'),
                      h.FontWeight('600'),
                    ],
                    [String(slice.data[1])]
                  )
                : h.empty,
            ]
          )
        })
      ),
      h.div(
        [h.Class('flex flex-col gap-1.5')],
        Arr.map(data, ([name, value], index) =>
          h.div(
            [h.Class('flex items-center gap-2')],
            [
              h.span([h.Class('inline-block h-3 w-3 shrink-0'), h.Style({ background: chartColor(index) })], []),
              h.span([h.Class('text-xs text-muted-foreground')], [`${name} (${value})`]),
            ]
          )
        )
      ),
    ]
  )
}

// ---- Horizontal bar chart (pure HTML, replaces recharts) ----

export const viewBarChart = <Message>({
  h,
  data,
}: {
  readonly h: HtmlBuilder<Message>
  readonly data: ReadonlyArray<ChartDatum>
}): Html => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div([h.Class('text-muted-foreground h-[100px] flex items-center justify-center')], ['No data available'])
  }

  const max = Math.max(...Arr.map(data, ([, value]) => value), 1)

  return h.div(
    [h.Class('flex flex-col gap-3 py-2')],
    Arr.map(data, ([name, value], index) =>
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          h.span([h.Class('w-20 shrink-0 text-xs text-right truncate'), h.Title(name)], [name]),
          h.div(
            [h.Class('flex-1 flex items-center gap-2')],
            [
              h.div(
                [
                  h.Class('h-6 rounded-r'),
                  h.Style({
                    background: chartColor(index),
                    width: `${((value / max) * 100).toFixed(1)}%`,
                  }),
                ],
                []
              ),
              h.span([h.Class('text-xs text-muted-foreground')], [String(value)]),
            ]
          ),
        ]
      )
    )
  )
}

// ---- Dose history step chart (pure SVG) ----

const DOSE_W = 800
const DOSE_H = 200

export const viewDoseHistory = <Message>({
  h,
  data,
  timezone,
}: {
  readonly h: HtmlBuilder<Message>
  readonly data: DoseHistoryStats
  readonly timezone: IanaTimezone
}): Html => {
  if (Arr.isReadonlyArrayEmpty(data.points)) {
    return h.div([h.Class('text-muted-foreground h-[200px]')], ['No dose data available'])
  }

  const margin = { bottom: 40, left: 50, right: 20, top: 20 }
  const width = DOSE_W - margin.left - margin.right
  const height = DOSE_H - margin.top - margin.bottom

  const points: ReadonlyArray<DosePoint> = Arr.sortWith(
    Arr.map(data.points, (point) => ({
      color: getDoseColor(`${point.drug}::${point.doseMg}`),
      date: point.date,
      doseMg: point.doseMg,
      drug: point.drug,
    })),
    (point) => point.date.getTime(),
    Order.Number
  )

  const [minDate, maxDate] = extent(points, (point) => point.date)
  const [minDose, maxDose] = extent(points, (point) => point.doseMg)

  if (minDate === undefined || maxDate === undefined || minDose === undefined || maxDose === undefined) {
    return h.empty
  }

  const xScale = scaleUtc().domain([minDate, maxDate]).range([0, width])
  const yPadding = (maxDose - minDose) * 0.2 || 2

  const yScale = scaleLinear()
    .domain([Math.max(0, minDose - yPadding), maxDose + yPadding])
    .range([height, 0])

  const doseLine = line<DosePoint>()
    .x((point) => xScale(point.date))
    .y((point) => yScale(point.doseMg))
    .curve(curveStepAfter)

  const segmentInitial: DoseSegmentBuild = { color: '', current: [], segments: [] }

  const builtSegments = Arr.reduce(points, segmentInitial, (build, point) => {
    if (point.color === build.color) {
      return { ...build, current: [...build.current, point] }
    }

    const seed = Arr.isReadonlyArrayNonEmpty(build.current) ? [Arr.lastNonEmpty(build.current), point] : [point]

    return { color: point.color, current: seed, segments: flushDoseSegment(build) }
  })

  const segments = flushDoseSegment(builtSegments)
  const attr = h.Attribute

  const formatDoseDate = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone }).format(date)

  const formatTick = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: timezone }).format(date)

  return h.div(
    [h.Class('relative w-full')],
    [
      h.svg(
        [h.ViewBox(`0 0 ${DOSE_W} ${DOSE_H}`), h.Class('block w-full h-auto')],
        [
          h.g(
            [h.Transform(`translate(${margin.left},${margin.top})`)],
            [
              ...Arr.map(yScale.ticks(5), (tick) =>
                h.line(
                  [
                    attr('x1', '0'),
                    attr('x2', String(width)),
                    attr('y1', String(yScale(tick))),
                    attr('y2', String(yScale(tick))),
                    h.Stroke('currentColor'),
                    h.Opacity('0.1'),
                  ],
                  []
                )
              ),
              ...Arr.flatMap(segments, (segment) => {
                if (segment.points.length < 2) {
                  return []
                }

                const d = doseLine([...segment.points])

                return d === null
                  ? []
                  : [h.path([attr('d', d), h.Fill('none'), h.Stroke(segment.color), h.StrokeWidth('2')], [])]
              }),
              ...Arr.map(points, (point) =>
                h.circle(
                  [
                    h.Cx(String(xScale(point.date))),
                    h.Cy(String(yScale(point.doseMg))),
                    attr('r', '4'),
                    h.Fill(point.color),
                    h.Stroke('var(--card)'),
                    h.StrokeWidth('2'),
                    h.Cursor('pointer'),
                    h.AriaLabel(`${point.drug} ${point.doseMg} mg on ${formatDoseDate(point.date)}`),
                  ],
                  []
                )
              ),
              h.g(
                [h.Transform(`translate(0,${height})`)],
                [
                  h.line([attr('x1', '0'), attr('x2', String(width)), h.Stroke('#e5e7eb')], []),
                  ...Arr.map(xScale.ticks(5), (tick) =>
                    h.text(
                      [
                        attr('x', String(xScale(tick))),
                        attr('y', '20'),
                        h.TextAnchor('middle'),
                        h.Fill('#9ca3af'),
                        h.FontSize('10px'),
                      ],
                      [formatTick(tick)]
                    )
                  ),
                ]
              ),
              h.g(
                [],
                Arr.map(yScale.ticks(5), (tick) =>
                  h.text(
                    [
                      attr('x', '-8'),
                      attr('y', String(yScale(tick) + 3)),
                      h.TextAnchor('end'),
                      h.Fill('#9ca3af'),
                      h.FontSize('10px'),
                    ],
                    [`${tick} mg`]
                  )
                )
              ),
            ]
          ),
        ]
      ),
    ]
  )
}
