import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import type { WeightTrajectoryTrendLine } from '@garage/subq-domain/WeightMath'
import { curveMonotoneX, line } from 'd3'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { CHART_HEIGHT, CHART_WIDTH, PILL } from './layout.ts'
import type { ChartFrame, Pill, Segment, WeightPointColored } from './layout.ts'
import { ClearedChartTooltip, ClickedChartPill, HoveredChartTooltip } from './state.ts'
import type { ChartMessage, ChartState } from './state.ts'

// Data marks drawn over the background layers: weight lines, trend, dots, dose pills, and the tooltip.

interface MarkOptions<Message> {
  readonly h: Html.H<Message | ChartMessage>
  readonly frame: ChartFrame
}

export const viewWeightPaths = <Message>({
  frame,
  h,
  segments,
}: MarkOptions<Message> & { readonly segments: ReadonlyArray<Segment> }): ReadonlyArray<
  View.Content<Message | ChartMessage>
> => {
  const path = line<WeightPointColored>()
    .x((point) => frame.xScale.position(point.date))
    .y((point) => frame.yScale.position(point.weight))
    .curve(curveMonotoneX)

  return Arr.flatMap(segments, (segment) => {
    if (segment.points.length < 2) {
      return []
    }

    const d = path([...segment.points])

    if (d === null) {
      return []
    }

    const selected = frame.isSelected(segment.compound, segment.doseMg)

    return [
      h
        .el('path')
        .attr('d', d)
        .attr('fill', 'none')
        .attr('stroke', segment.color)
        .attr('stroke-width', selected ? '2' : '1')
        .attr('opacity', selected ? '1' : '0.15')
        .attr('pointer-events', 'none'),
    ]
  })
}

export const viewTrendLine = <Message>({
  frame,
  h,
  trendLine,
}: MarkOptions<Message> & { readonly trendLine: Option.Option<WeightTrajectoryTrendLine> }): ReadonlyArray<
  View.Content<Message | ChartMessage>
> => {
  const { displayWeight, domainEndMs, domainStartMs, filter, margin, unitLabel, width, yScale } = frame

  return Option.match(trendLine, {
    onNone: (): ReadonlyArray<View.Content<Message | ChartMessage>> => [],
    onSome: (trend) => {
      const y1 = yScale.position(trend.slope * domainStartMs + trend.intercept)
      const y2 = yScale.position(trend.slope * domainEndMs + trend.intercept)
      const lbsPerWeek = trend.slope * 7 * 24 * 60 * 60 * 1000
      const ratePerWeek = displayWeight(Math.abs(lbsPerWeek))

      const rateText =
        Math.abs(lbsPerWeek) <= 0.01
          ? 'Maintaining weight'
          : `${lbsPerWeek > 0 ? '+' : '-'}${ratePerWeek.toFixed(2)} ${unitLabel}/week`

      return [
        h
          .el('line')
          .attr('x1', '0')
          .attr('y1', String(y1))
          .attr('x2', String(width))
          .attr('y2', String(y2))
          .attr('stroke', 'transparent')
          .attr('stroke-width', '12')
          .attr('cursor', 'pointer')
          .on(
            'mouseenter',
            HoveredChartTooltip({
              lines: [
                rateText,
                `${displayWeight(trend.startWeightLbs).toFixed(1)} → ${displayWeight(trend.endWeightLbs).toFixed(1)} ${unitLabel}`,
              ],
              title: 'Trend Line',
              x: margin.left + width / 2,
              y: margin.top + (y1 + y2) / 2,
            })
          )
          .on('mouseleave', ClearedChartTooltip()),
        h
          .el('line')
          .attr('x1', '0')
          .attr('y1', String(y1))
          .attr('x2', String(width))
          .attr('y2', String(y2))
          .attr('stroke', 'var(--foreground)')
          .attr('stroke-width', '2')
          .attr('stroke-dasharray', '8,4')
          .attr('opacity', filter === null ? '0.7' : '0.4')
          .attr('pointer-events', 'none'),
      ]
    },
  })
}

export const viewWeightDots = <Message>({
  frame,
  h,
  segments,
}: MarkOptions<Message> & { readonly segments: ReadonlyArray<Segment> }): ReadonlyArray<
  View.Content<Message | ChartMessage>
> => {
  const { displayWeight, formatDate, margin, unitLabel, xScale, yScale } = frame

  return Arr.map(
    Arr.flatMap(segments, (segment) => segment.points),
    (point) => {
      const selected = frame.isSelected(point.compound, point.doseMg)
      const cx = xScale.position(point.date)
      const cy = yScale.position(point.weight)

      const noteLines = point.notes.pipe(
        Option.filter((note) => note !== ''),
        Option.toArray
      )

      return h
        .el('circle')
        .attr('cx', String(cx))
        .attr('cy', String(cy))
        .attr('r', selected ? '4' : '2')
        .attr('fill', point.color)
        .attr('stroke', 'var(--card)')
        .attr('stroke-width', selected ? '2' : '1')
        .attr('opacity', selected ? '1' : '0.15')
        .attr('cursor', 'pointer')
        .attr('aria-label', `${displayWeight(point.weight).toFixed(1)} ${unitLabel} on ${formatDate(point.date)}`)
        .on(
          'mouseenter',
          HoveredChartTooltip({
            lines: [formatDate(point.date), ...noteLines],
            title: `${displayWeight(point.weight).toFixed(1)} ${unitLabel}`,
            x: margin.left + cx,
            y: margin.top + cy,
          })
        )
        .on('mouseleave', ClearedChartTooltip())
    }
  )
}

const rowOffset = (row: number): number => row * (PILL.HEIGHT + PILL.VERTICAL_GAP)

export const viewDosePills = <Message>({
  frame,
  h,
  pills,
}: MarkOptions<Message> & { readonly pills: ReadonlyArray<Pill> }): ReadonlyArray<
  View.Content<Message | ChartMessage>
> => {
  const { filter, formatDate, margin, yScale } = frame

  return Arr.flatMap(pills, (pill) => {
    const selected = filter === null || (pill.compound === filter.compound && pill.doseMg === filter.doseMg)
    const px = Math.max(PILL.WIDTH / 2, pill.x)
    const py = 12 + rowOffset(pill.row)

    return [
      h
        .el('line')
        .attr('x1', String(px))
        .attr('x2', String(px))
        .attr('y1', String(20 + rowOffset(pill.row)))
        .attr('y2', String(yScale.position(pill.weight)))
        .attr('stroke', pill.color)
        .attr('stroke-width', '1')
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', selected ? '0.4' : '0.1')
        .attr('pointer-events', 'none'),
      h
        .el('g')
        .attr('transform', `translate(${px},${py})`)
        .attr('cursor', 'pointer')
        .attr('aria-label', `${pill.compound} ${pill.doseMg} mg on ${formatDate(pill.date)}`)
        .on('click', ClickedChartPill({ doseMg: pill.doseMg, compound: pill.compound }))
        .on(
          'mouseenter',
          HoveredChartTooltip({
            lines: filter === null ? [formatDate(pill.date), 'Click to filter'] : [formatDate(pill.date)],
            title: `${pill.compound} ${pill.doseMg} mg`,
            x: margin.left + px,
            y: margin.top + py,
          })
        )
        .on('mouseleave', ClearedChartTooltip())
        .children(
          h
            .el('rect')
            .attr('rx', '10')
            .attr('ry', '10')
            .attr('x', String(-PILL.WIDTH / 2))
            .attr('y', '-10')
            .attr('width', String(PILL.WIDTH))
            .attr('height', String(PILL.HEIGHT))
            .attr('fill', pill.color)
            .attr('opacity', selected ? '1' : '0.25'),
          h
            .el('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('fill', '#fff')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .children(`${pill.doseMg} mg`)
        ),
    ]
  })
}

export const viewTooltip = <Message>({
  h,
  tooltip,
}: {
  readonly h: Html.H<Message | ChartMessage>
  readonly tooltip: ChartState['tooltip']
}): View.Content<Message | ChartMessage> | false =>
  tooltip === null
    ? false
    : h.div
        .class(
          'absolute bg-foreground text-background px-3.5 py-2.5 rounded-md text-xs leading-relaxed pointer-events-none z-50 max-w-[220px] shadow-md -translate-x-1/2 -translate-y-full'
        )
        .style({
          left: `${((tooltip.x / CHART_WIDTH) * 100).toFixed(2)}%`,
          top: `calc(${((tooltip.y / CHART_HEIGHT) * 100).toFixed(2)}% - 10px)`,
        })
        .children(
          h.div.class('font-semibold mb-0.5').children(tooltip.title),
          ...Arr.map(tooltip.lines, (text) => h.div.class('opacity-70').children(text))
        )
