import { curveMonotoneX, line } from 'd3'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { TrendLine } from '#shared'

import { CHART_HEIGHT, CHART_WIDTH, PILL } from './layout.js'
import type { ChartFrame, Pill, Segment, WeightPointColored } from './layout.js'
import { ClearedChartTooltip, ClickedChartPill, HoveredChartTooltip } from './state.js'
import type { ChartMessage, ChartState } from './state.js'

// Data marks drawn over the background layers: weight lines, trend, dots, dose pills, and the tooltip.

interface MarkOptions<Message> {
  readonly h: HtmlBuilder<Message | ChartMessage>
  readonly frame: ChartFrame
}

export const viewWeightPaths = <Message>({
  frame,
  h,
  segments,
}: MarkOptions<Message> & { readonly segments: ReadonlyArray<Segment> }): ReadonlyArray<Html> => {
  const path = line<WeightPointColored>()
    .x((point) => frame.xScale(point.date))
    .y((point) => frame.yScale(point.weight))
    .curve(curveMonotoneX)

  return Arr.flatMap(segments, (segment) => {
    if (segment.points.length < 2) {
      return []
    }

    const d = path([...segment.points])

    if (d === null) {
      return []
    }

    const selected = frame.isSelected(segment.drug, segment.doseMg)

    return [
      h.path(
        [
          h.Attribute('d', d),
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
}

export const viewTrendLine = <Message>({
  frame,
  h,
  trendLine,
}: MarkOptions<Message> & { readonly trendLine: Option.Option<TrendLine> }): ReadonlyArray<Html> => {
  const { displayWeight, domainEndMs, domainStartMs, filter, margin, unitLabel, width, yScale } = frame

  return Option.match(trendLine, {
    onNone: (): ReadonlyArray<Html> => [],
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
            h.Attribute('x1', '0'),
            h.Attribute('y1', String(y1)),
            h.Attribute('x2', String(width)),
            h.Attribute('y2', String(y2)),
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
            h.Attribute('x1', '0'),
            h.Attribute('y1', String(y1)),
            h.Attribute('x2', String(width)),
            h.Attribute('y2', String(y2)),
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
}

export const viewWeightDots = <Message>({
  frame,
  h,
  segments,
}: MarkOptions<Message> & { readonly segments: ReadonlyArray<Segment> }): ReadonlyArray<Html> => {
  const { displayWeight, formatDate, margin, unitLabel, xScale, yScale } = frame

  return Arr.map(
    Arr.flatMap(segments, (segment) => segment.points),
    (point) => {
      const selected = frame.isSelected(point.drug, point.doseMg)
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
          h.Attribute('r', selected ? '4' : '2'),
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
    }
  )
}

const rowOffset = (row: number): number => row * (PILL.HEIGHT + PILL.VERTICAL_GAP)

export const viewDosePills = <Message>({
  frame,
  h,
  pills,
}: MarkOptions<Message> & { readonly pills: ReadonlyArray<Pill> }): ReadonlyArray<Html> => {
  const { filter, formatDate, margin, yScale } = frame

  return Arr.flatMap(pills, (pill) => {
    const selected = filter === null || (pill.drug === filter.drug && pill.doseMg === filter.doseMg)
    const px = Math.max(PILL.WIDTH / 2, pill.x)
    const py = 12 + rowOffset(pill.row)

    return [
      h.line(
        [
          h.Attribute('x1', String(px)),
          h.Attribute('x2', String(px)),
          h.Attribute('y1', String(20 + rowOffset(pill.row))),
          h.Attribute('y2', String(yScale(pill.weight))),
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
              h.Attribute('x', String(-PILL.WIDTH / 2)),
              h.Attribute('y', '-10'),
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
}

export const viewTooltip = <Message>({
  h,
  tooltip,
}: {
  readonly h: HtmlBuilder<Message | ChartMessage>
  readonly tooltip: ChartState['tooltip']
}): Html =>
  tooltip === null
    ? h.empty
    : h.div(
        [
          h.Class(
            'absolute bg-foreground text-background px-3.5 py-2.5 rounded-md text-xs leading-relaxed pointer-events-none z-50 max-w-[220px] shadow-md -translate-x-1/2 -translate-y-full'
          ),
          h.Style({
            left: `${((tooltip.x / CHART_WIDTH) * 100).toFixed(2)}%`,
            top: `calc(${((tooltip.y / CHART_HEIGHT) * 100).toFixed(2)}% - 10px)`,
          }),
        ],
        [
          h.div([h.Class('font-semibold mb-0.5')], [tooltip.title]),
          ...Arr.map(tooltip.lines, (text) => h.div([h.Class('opacity-70')], [text])),
        ]
      )
