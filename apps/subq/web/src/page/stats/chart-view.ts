import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { IanaTimezone } from '@garage/subq-domain/Calendar'
import type { doseHistory } from '@garage/subq-domain/StatsMath'
import { arc, curveStepAfter, extent, line, pie } from 'd3'
import type { PieArcDatum } from 'd3'
import * as Arr from 'effect/Array'
import * as Order from 'effect/Order'

import { linearScale, utcScale } from '../../chart/scale.ts'

type DoseHistoryStats = ReturnType<typeof doseHistory>

import { CHART_COLORS, getDoseColor } from '../../chart/colors.ts'

type ChartDatum = readonly [string, number]

interface DosePoint {
  readonly date: Date
  readonly compound: string
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
  readonly h: Html.H<Message>
  readonly data: ReadonlyArray<ChartDatum>
}): View.Content<Message> | false => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div.class('text-muted-foreground h-[200px] flex items-center justify-center').children('No data available')
  }

  // d3's pie generator method, not Array#sort — null disables slice reordering
  const pieLayout = pie<ChartDatum>()
    .value(([, value]) => value)
    .padAngle(0.035)
    .sort(null)

  const sliceArc = arc<PieArcDatum<ChartDatum>>().innerRadius(50).outerRadius(80)
  const labelArc = arc<PieArcDatum<ChartDatum>>().innerRadius(65).outerRadius(65)
  const arcs = pieLayout([...data])

  return h.div.class('flex items-center justify-center gap-6 h-[250px]').children(
    h
      .el('svg')
      .attr('viewBox', '-90 -90 180 180')
      .attr('class', 'h-[180px] w-[180px] shrink-0')
      .children(
        Arr.map(arcs, (slice, index) => {
          const d = sliceArc(slice)
          const [lx, ly] = labelArc.centroid(slice)

          return h
            .el('g')
            .children(
              d === null
                ? null
                : h
                    .el('path')
                    .attr('d', d)
                    .attr('fill', chartColor(index))
                    .attr('stroke', 'var(--card)')
                    .attr('stroke-width', '2'),
              slice.data[1] > 0
                ? h
                    .el('text')
                    .attr('x', String(lx))
                    .attr('y', String(ly))
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.35em')
                    .attr('fill', '#fff')
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .children(String(slice.data[1]))
                : null
            )
        })
      ),
    h.div
      .class('flex flex-col gap-1.5')
      .children(
        Arr.map(data, ([name, value], index) =>
          h.div
            .class('flex items-center gap-2')
            .children(
              h.span.class('inline-block h-3 w-3 shrink-0').style({ background: chartColor(index) }),
              h.span.class('text-xs text-muted-foreground').children(`${name} (${value})`)
            )
        )
      )
  )
}

// ---- Horizontal bar chart (pure HTML, replaces recharts) ----

export const viewBarChart = <Message>({
  h,
  data,
}: {
  readonly h: Html.H<Message>
  readonly data: ReadonlyArray<ChartDatum>
}): View.Content<Message> | false => {
  if (Arr.isReadonlyArrayEmpty(data)) {
    return h.div.class('text-muted-foreground h-[100px] flex items-center justify-center').children('No data available')
  }

  const max = Math.max(...Arr.map(data, ([, value]) => value), 1)

  return h.div.class('flex flex-col gap-3 py-2').children(
    Arr.map(data, ([name, value], index) =>
      h.div.class('flex items-center gap-3').children(
        h.span.class('w-20 shrink-0 text-xs text-right truncate').attr('title', name).children(name),
        h.div.class('flex-1 flex items-center gap-2').children(
          h.div.class('h-6 rounded-r').style({
            background: chartColor(index),
            width: `${((value / max) * 100).toFixed(1)}%`,
          }),
          h.span.class('text-xs text-muted-foreground').children(String(value))
        )
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
  readonly h: Html.H<Message>
  readonly data: DoseHistoryStats
  readonly timezone: IanaTimezone
}): View.Content<Message> | false => {
  if (Arr.isReadonlyArrayEmpty(data.points)) {
    return h.div.class('text-muted-foreground h-[200px]').children('No dose data available')
  }

  const margin = { bottom: 40, left: 50, right: 20, top: 20 }
  const width = DOSE_W - margin.left - margin.right
  const height = DOSE_H - margin.top - margin.bottom

  const points: ReadonlyArray<DosePoint> = Arr.sortWith(
    Arr.map(data.points, (point) => ({
      color: getDoseColor(`${point.compound}::${point.doseMg}`),
      date: point.date,
      doseMg: point.doseMg,
      compound: point.compound,
    })),
    (point) => point.date.getTime(),
    Order.Number
  )

  const [minDate, maxDate] = extent(points, (point) => point.date)
  const [minDose, maxDose] = extent(points, (point) => point.doseMg)

  if (minDate === undefined || maxDate === undefined || minDose === undefined || maxDose === undefined) {
    return false
  }

  const xScale = utcScale({ start: minDate, end: maxDate, width })
  const yPadding = (maxDose - minDose) * 0.2 || 2

  const yScale = linearScale({ min: Math.max(0, minDose - yPadding), max: maxDose + yPadding, height })

  const doseLine = line<DosePoint>()
    .x((point) => xScale.position(point.date))
    .y((point) => yScale.position(point.doseMg))
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

  const formatDoseDate = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone }).format(date)

  const formatTick = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: timezone }).format(date)

  return h.div.class('relative w-full').children(
    h
      .el('svg')
      .attr('viewBox', `0 0 ${DOSE_W} ${DOSE_H}`)
      .attr('class', 'block w-full h-auto')
      .children(
        h
          .el('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
          .children(
            ...Arr.map(yScale.ticks(5), (tick) =>
              h
                .el('line')
                .attr('x1', '0')
                .attr('x2', String(width))
                .attr('y1', String(yScale.position(tick)))
                .attr('y2', String(yScale.position(tick)))
                .attr('stroke', 'currentColor')
                .attr('opacity', '0.1')
            ),
            ...Arr.flatMap(segments, (segment) => {
              if (segment.points.length < 2) {
                return []
              }

              const d = doseLine([...segment.points])

              return d === null
                ? []
                : [
                    h
                      .el('path')
                      .attr('d', d)
                      .attr('fill', 'none')
                      .attr('stroke', segment.color)
                      .attr('stroke-width', '2'),
                  ]
            }),
            ...Arr.map(points, (point) =>
              h
                .el('circle')
                .attr('cx', String(xScale.position(point.date)))
                .attr('cy', String(yScale.position(point.doseMg)))
                .attr('r', '4')
                .attr('fill', point.color)
                .attr('stroke', 'var(--card)')
                .attr('stroke-width', '2')
                .attr('cursor', 'pointer')
                .attr('aria-label', `${point.compound} ${point.doseMg} mg on ${formatDoseDate(point.date)}`)
            ),
            h
              .el('g')
              .attr('transform', `translate(0,${height})`)
              .children(
                h.el('line').attr('x1', '0').attr('x2', String(width)).attr('stroke', '#e5e7eb'),
                ...Arr.map(xScale.ticks(5), (tick) =>
                  h
                    .el('text')
                    .attr('x', String(xScale.position(tick)))
                    .attr('y', '20')
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#9ca3af')
                    .attr('font-size', '10px')
                    .children(formatTick(tick))
                )
              ),
            h.el('g').children(
              Arr.map(yScale.ticks(5), (tick) =>
                h
                  .el('text')
                  .attr('x', '-8')
                  .attr('y', String(yScale.position(tick) + 3))
                  .attr('text-anchor', 'end')
                  .attr('fill', '#9ca3af')
                  .attr('font-size', '10px')
                  .children(`${tick} mg`)
              )
            )
          )
      )
  )
}
