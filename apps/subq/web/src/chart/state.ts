import { UiSchema } from '@effect/ui'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'

// ============================================
// Chart state (lives inside the stats page model)
// ============================================

const ChartTooltip = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  title: Schema.String,
  lines: Schema.Array(Schema.String),
})

const CompoundDoseFilter = Schema.Struct({ compound: Schema.String, doseMg: Schema.Finite })

const ZoomDrag = Schema.Struct({ startMs: Schema.Finite, hoverMs: Schema.Finite })

export const ChartState = Schema.Struct({
  tooltip: Schema.NullOr(ChartTooltip),
  filter: Schema.NullOr(CompoundDoseFilter),
  zoomDrag: Schema.NullOr(ZoomDrag),
})

export type ChartState = typeof ChartState.Type

export const initialChartState: ChartState = { filter: null, tooltip: null, zoomDrag: null }

// ============================================
// Chart messages
// ============================================

export const ChartMessage = UiSchema.TaggedEnum({
  HoveredChartTooltip: {
    x: Schema.Finite,
    y: Schema.Finite,
    title: Schema.String,
    lines: Schema.Array(Schema.String),
  },
  ClearedChartTooltip: {},
  ClickedChartPill: { compound: Schema.String, doseMg: Schema.Finite },
  ClearedChartFilter: {},
  StartedChartZoom: { ms: Schema.Finite },
  HoveredChartZoom: { ms: Schema.Finite },
  EndedChartZoom: {},
  CancelledChartZoom: {},
})

export const {
  HoveredChartTooltip,
  ClearedChartTooltip,
  ClickedChartPill,
  ClearedChartFilter,
  StartedChartZoom,
  HoveredChartZoom,
  EndedChartZoom,
  CancelledChartZoom,
} = ChartMessage

export type ChartMessage = typeof ChartMessage.Type

type ChartUpdate = readonly [ChartState, Option.Option<{ readonly startMs: number; readonly endMs: number }>]

// Returns the new state plus a committed zoom range when a drag completes.
export const updateChart: {
  (message: ChartMessage): (state: ChartState) => ChartUpdate
  (state: ChartState, message: ChartMessage): ChartUpdate
} = Function.dual(2, (state: ChartState, message: ChartMessage): ChartUpdate =>
  Match.value(message).pipe(
    Match.withReturnType<ChartUpdate>(),
    Match.tagsExhaustive({
      CancelledChartZoom: () => [Struct.evolve(state, { zoomDrag: () => null }), Option.none()],
      ClearedChartFilter: () => [Struct.evolve(state, { filter: () => null }), Option.none()],
      ClearedChartTooltip: () => [Struct.evolve(state, { tooltip: () => null }), Option.none()],
      ClickedChartPill: ({ doseMg, compound }) => [
        Struct.evolve(state, {
          filter: (filter) =>
            filter !== null && filter.compound === compound && filter.doseMg === doseMg ? null : { doseMg, compound },
          tooltip: () => null,
        }),
        Option.none(),
      ],
      EndedChartZoom: () => {
        if (state.zoomDrag === null) {
          return [state, Option.none()]
        }

        const { hoverMs, startMs } = state.zoomDrag
        const next = Struct.evolve(state, { zoomDrag: () => null })

        if (Math.abs(hoverMs - startMs) < 1000 * 60 * 60 * 24) {
          return [next, Option.none()]
        }

        return [next, Option.some({ endMs: Math.max(startMs, hoverMs), startMs: Math.min(startMs, hoverMs) })]
      },
      HoveredChartTooltip: ({ lines, title, x, y }) => [
        Struct.evolve(state, { tooltip: () => ({ lines, title, x, y }) }),
        Option.none(),
      ],
      HoveredChartZoom: ({ ms }) => [
        Struct.evolve(state, {
          zoomDrag: (drag) => (drag === null ? null : Struct.evolve(drag, { hoverMs: () => ms })),
        }),
        Option.none(),
      ],
      StartedChartZoom: ({ ms }) => [
        Struct.evolve(state, { zoomDrag: () => ({ hoverMs: ms, startMs: ms }) }),
        Option.none(),
      ],
    })
  )
)
