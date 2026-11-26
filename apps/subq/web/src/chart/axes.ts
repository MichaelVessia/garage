import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { epochToDate } from '../lib/datetime.ts'
import type { ChartFrame, SchedulePeriod } from './layout.ts'
import { ClearedChartTooltip, HoveredChartTooltip, HoveredChartZoom, StartedChartZoom } from './state.ts'
import type { ChartMessage, ChartState } from './state.ts'

// Background chart layers: grid, axes, schedule bands, and drag-zoom hit strips.

interface LayerOptions<Message> {
  readonly h: Html.H<Message | ChartMessage>
  readonly frame: ChartFrame
}

export const viewGridLines = <Message>({
  frame,
  h,
}: LayerOptions<Message>): ReadonlyArray<View.Content<Message | ChartMessage>> =>
  Arr.map(frame.yScale.ticks(5), (tick) =>
    h
      .el('line')
      .attr('x1', '0')
      .attr('x2', String(frame.width))
      .attr('y1', String(frame.yScale.position(tick)))
      .attr('y2', String(frame.yScale.position(tick)))
      .attr('stroke', 'currentColor')
      .attr('opacity', '0.08')
  )

export const viewXAxis = <Message>({
  formatTick,
  frame,
  h,
}: LayerOptions<Message> & { readonly formatTick: (date: Date) => string }): View.Content<Message | ChartMessage> =>
  h
    .el('g')
    .attr('transform', `translate(0,${frame.height})`)
    .children(
      h.el('line').attr('x1', '0').attr('x2', String(frame.width)).attr('stroke', '#e5e7eb'),
      ...Arr.map(frame.xScale.ticks(5), (tick) =>
        h
          .el('g')
          .attr('transform', `translate(${frame.xScale.position(tick)},0)`)
          .children(
            h.el('line').attr('y2', '6').attr('stroke', '#e5e7eb'),
            h
              .el('text')
              .attr('y', '20')
              .attr('text-anchor', 'middle')
              .attr('fill', '#9ca3af')
              .attr('font-size', '11px')
              .children(formatTick(tick))
          )
      )
    )

export const viewYAxis = <Message>({ frame, h }: LayerOptions<Message>): View.Content<Message | ChartMessage> =>
  h.el('g').children(
    Arr.map(frame.yScale.ticks(5), (tick) =>
      h
        .el('text')
        .attr('x', '-8')
        .attr('y', String(frame.yScale.position(tick) + 3))
        .attr('text-anchor', 'end')
        .attr('fill', '#9ca3af')
        .attr('font-size', '11px')
        .children(String(Math.round(frame.displayWeight(tick) * 10) / 10))
    )
  )

export const viewYLabel = <Message>({ frame, h }: LayerOptions<Message>): View.Content<Message | ChartMessage> =>
  h
    .el('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', '-40')
    .attr('x', String(-frame.height / 2))
    .attr('text-anchor', 'middle')
    .attr('fill', '#9ca3af')
    .attr('font-size', '11px')
    .children(`Weight (${frame.unitLabel})`)

export const viewScheduleBands = <Message>({
  frame,
  h,
  schedulePeriods,
}: LayerOptions<Message> & { readonly schedulePeriods: ReadonlyArray<SchedulePeriod> }): ReadonlyArray<
  View.Content<Message | ChartMessage>
> => {
  const { domainEndMs, domainStartMs, formatDate, height, margin, xScale } = frame

  return Arr.flatMap(schedulePeriods, (schedule) => {
    const endMs = Option.match(schedule.endDateExclusive, {
      onNone: () => domainEndMs,
      onSome: (date) => date.getTime(),
    })

    const startMs = schedule.startDate.getTime()

    if (endMs < domainStartMs || startMs > domainEndMs) {
      return []
    }

    const x1 = xScale.position(epochToDate(Math.max(startMs, domainStartMs)))
    const x2 = xScale.position(epochToDate(Math.min(endMs, domainEndMs)))

    if (x2 - x1 < 2) {
      return []
    }

    const displayedRange = `${formatDate(schedule.startDate)} — ${Option.match(schedule.endDateInclusive, {
      onNone: () => 'ongoing',
      onSome: (date) => formatDate(date),
    })}`

    return [
      h
        .el('rect')
        .attr('x', String(x1))
        .attr('y', '0')
        .attr('width', String(x2 - x1))
        .attr('height', String(height))
        .attr('fill', 'currentColor')
        .attr('opacity', '0.04')
        .attr('aria-label', `${schedule.scheduleName} (${schedule.compound}), ${displayedRange}`)
        .on(
          'mouseenter',
          HoveredChartTooltip({
            lines: [displayedRange],
            title: `${schedule.scheduleName} (${schedule.compound})`,
            x: margin.left + (x1 + x2) / 2,
            y: margin.top + 24,
          })
        )
        .on('mouseleave', ClearedChartTooltip()),
    ]
  })
}

// Zoom hit strips: one per x-axis day-ish interval (60 strips)
const STRIPS = 60

export const viewZoomStrips = <Message>({
  frame,
  h,
}: LayerOptions<Message>): ReadonlyArray<View.Content<Message | ChartMessage>> => {
  const stripWidth = frame.width / STRIPS
  const msPerStrip = (frame.domainEndMs - frame.domainStartMs) / STRIPS

  return Array.from({ length: STRIPS }, (_, index) => {
    const ms = frame.domainStartMs + msPerStrip * (index + 0.5)

    return h
      .el('rect')
      .attr('x', String(index * stripWidth))
      .attr('y', '0')
      .attr('width', String(stripWidth))
      .attr('height', String(frame.height))
      .attr('fill', 'transparent')
      .on('mousedown', StartedChartZoom({ ms }))
      .on('mouseenter', HoveredChartZoom({ ms }))
  })
}

export const viewZoomSelection = <Message>({
  frame,
  h,
  zoomDrag,
}: LayerOptions<Message> & { readonly zoomDrag: ChartState['zoomDrag'] }):
  | View.Content<Message | ChartMessage>
  | false => {
  if (zoomDrag === null) {
    return false
  }

  const startX = frame.xScale.position(epochToDate(zoomDrag.startMs))
  const hoverX = frame.xScale.position(epochToDate(zoomDrag.hoverMs))

  return h
    .el('rect')
    .attr('x', String(Math.min(startX, hoverX)))
    .attr('y', '0')
    .attr('width', String(Math.abs(hoverX - startX)))
    .attr('height', String(frame.height))
    .attr('fill', 'currentColor')
    .attr('opacity', '0.1')
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', '0.3')
    .attr('rx', '3')
    .attr('pointer-events', 'none')
}
