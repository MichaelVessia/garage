import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { epochToDate } from '../lib/datetime.js'
import type { ChartFrame, SchedulePeriod } from './layout.js'
import { ClearedChartTooltip, HoveredChartTooltip, HoveredChartZoom, StartedChartZoom } from './state.js'
import type { ChartMessage, ChartState } from './state.js'

// Background chart layers: grid, axes, schedule bands, and drag-zoom hit strips.

interface LayerOptions<Message> {
  readonly h: HtmlBuilder<Message | ChartMessage>
  readonly frame: ChartFrame
}

export const viewGridLines = <Message>({ frame, h }: LayerOptions<Message>): ReadonlyArray<Html> =>
  Arr.map(frame.yScale.ticks(5), (tick) =>
    h.line(
      [
        h.Attribute('x1', '0'),
        h.Attribute('x2', String(frame.width)),
        h.Attribute('y1', String(frame.yScale(tick))),
        h.Attribute('y2', String(frame.yScale(tick))),
        h.Stroke('currentColor'),
        h.Opacity('0.08'),
      ],
      []
    )
  )

export const viewXAxis = <Message>({
  formatTick,
  frame,
  h,
}: LayerOptions<Message> & { readonly formatTick: (date: Date) => string }): Html =>
  h.g(
    [h.Transform(`translate(0,${frame.height})`)],
    [
      h.line([h.Attribute('x1', '0'), h.Attribute('x2', String(frame.width)), h.Stroke('#e5e7eb')], []),
      ...Arr.map(frame.xScale.ticks(5), (tick) =>
        h.g(
          [h.Transform(`translate(${frame.xScale(tick)},0)`)],
          [
            h.line([h.Attribute('y2', '6'), h.Stroke('#e5e7eb')], []),
            h.text(
              [h.Attribute('y', '20'), h.TextAnchor('middle'), h.Fill('#9ca3af'), h.FontSize('11px')],
              [formatTick(tick)]
            ),
          ]
        )
      ),
    ]
  )

export const viewYAxis = <Message>({ frame, h }: LayerOptions<Message>): Html =>
  h.g(
    [],
    Arr.map(frame.yScale.ticks(5), (tick) =>
      h.text(
        [
          h.Attribute('x', '-8'),
          h.Attribute('y', String(frame.yScale(tick) + 3)),
          h.TextAnchor('end'),
          h.Fill('#9ca3af'),
          h.FontSize('11px'),
        ],
        [String(Math.round(frame.displayWeight(tick) * 10) / 10)]
      )
    )
  )

export const viewYLabel = <Message>({ frame, h }: LayerOptions<Message>): Html =>
  h.text(
    [
      h.Transform('rotate(-90)'),
      h.Attribute('y', '-40'),
      h.Attribute('x', String(-frame.height / 2)),
      h.TextAnchor('middle'),
      h.Fill('#9ca3af'),
      h.FontSize('11px'),
    ],
    [`Weight (${frame.unitLabel})`]
  )

export const viewScheduleBands = <Message>({
  frame,
  h,
  schedulePeriods,
}: LayerOptions<Message> & { readonly schedulePeriods: ReadonlyArray<SchedulePeriod> }): ReadonlyArray<Html> => {
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

    const x1 = xScale(epochToDate(Math.max(startMs, domainStartMs)))
    const x2 = xScale(epochToDate(Math.min(endMs, domainEndMs)))

    if (x2 - x1 < 2) {
      return []
    }

    const displayedRange = `${formatDate(schedule.startDate)} — ${Option.match(schedule.endDateInclusive, {
      onNone: () => 'ongoing',
      onSome: (date) => formatDate(date),
    })}`

    return [
      h.rect(
        [
          h.Attribute('x', String(x1)),
          h.Attribute('y', '0'),
          h.Width(String(x2 - x1)),
          h.Height(String(height)),
          h.Fill('currentColor'),
          h.Opacity('0.04'),
          h.AriaLabel(`${schedule.scheduleName} (${schedule.drug}), ${displayedRange}`),
          h.OnMouseEnter(
            HoveredChartTooltip({
              lines: [displayedRange],
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
}

// Zoom hit strips: one per x-axis day-ish interval (60 strips)
const STRIPS = 60

export const viewZoomStrips = <Message>({ frame, h }: LayerOptions<Message>): ReadonlyArray<Html> => {
  const stripWidth = frame.width / STRIPS
  const msPerStrip = (frame.domainEndMs - frame.domainStartMs) / STRIPS

  return Array.from({ length: STRIPS }, (_, index) => {
    const ms = frame.domainStartMs + msPerStrip * (index + 0.5)

    return h.rect(
      [
        h.Attribute('x', String(index * stripWidth)),
        h.Attribute('y', '0'),
        h.Width(String(stripWidth)),
        h.Height(String(frame.height)),
        h.Fill('transparent'),
        h.OnMouseDown(StartedChartZoom({ ms })),
        h.OnMouseEnter(HoveredChartZoom({ ms })),
      ],
      []
    )
  })
}

export const viewZoomSelection = <Message>({
  frame,
  h,
  zoomDrag,
}: LayerOptions<Message> & { readonly zoomDrag: ChartState['zoomDrag'] }): Html => {
  if (zoomDrag === null) {
    return h.empty
  }

  const startX = frame.xScale(epochToDate(zoomDrag.startMs))
  const hoverX = frame.xScale(epochToDate(zoomDrag.hoverMs))

  return h.rect(
    [
      h.Attribute('x', String(Math.min(startX, hoverX))),
      h.Attribute('y', '0'),
      h.Width(String(Math.abs(hoverX - startX))),
      h.Height(String(frame.height)),
      h.Fill('currentColor'),
      h.Opacity('0.1'),
      h.Stroke('currentColor'),
      h.StrokeOpacity('0.3'),
      h.Rx('3'),
      h.PointerEvents('none'),
    ],
    []
  )
}
