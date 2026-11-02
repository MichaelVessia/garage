import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { taggedStruct } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

// ============================================
// Chart state (lives inside the stats page model)
// ============================================

const ChartTooltip = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  title: Schema.String,
  lines: Schema.Array(Schema.String),
})

const DrugDoseFilter = Schema.Struct({ drug: Schema.String, doseMg: Schema.Finite })

const ZoomDrag = Schema.Struct({ startMs: Schema.Finite, hoverMs: Schema.Finite })

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

export const HoveredChartTooltip = taggedStruct('HoveredChartTooltip', {
  x: Schema.Finite,
  y: Schema.Finite,
  title: Schema.String,
  lines: Schema.Array(Schema.String),
})

export const ClearedChartTooltip = taggedStruct('ClearedChartTooltip')
export const ClickedChartPill = taggedStruct('ClickedChartPill', { drug: Schema.String, doseMg: Schema.Finite })
export const ClearedChartFilter = taggedStruct('ClearedChartFilter')
export const StartedChartZoom = taggedStruct('StartedChartZoom', { ms: Schema.Finite })
export const HoveredChartZoom = taggedStruct('HoveredChartZoom', { ms: Schema.Finite })
export const EndedChartZoom = taggedStruct('EndedChartZoom')
export const CancelledChartZoom = taggedStruct('CancelledChartZoom')

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

type ChartUpdate = readonly [ChartState, Option.Option<{ readonly startMs: number; readonly endMs: number }>]

// Returns the new state plus a committed zoom range when a drag completes.
export const updateChart: {
  (message: ChartMessage): (state: ChartState) => ChartUpdate
  (state: ChartState, message: ChartMessage): ChartUpdate
} = Function.dual(2, (state: ChartState, message: ChartMessage): ChartUpdate =>
  Match.value(message).pipe(
    Match.withReturnType<ChartUpdate>(),
    Match.tagsExhaustive({
      CancelledChartZoom: () => [modifyFields(state, { zoomDrag: () => null }), Option.none()],
      ClearedChartFilter: () => [modifyFields(state, { filter: () => null }), Option.none()],
      ClearedChartTooltip: () => [modifyFields(state, { tooltip: () => null }), Option.none()],
      ClickedChartPill: ({ doseMg, drug }) => [
        modifyFields(state, {
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
        const next = modifyFields(state, { zoomDrag: () => null })

        if (Math.abs(hoverMs - startMs) < 1000 * 60 * 60 * 24) {
          return [next, Option.none()]
        }

        return [next, Option.some({ endMs: Math.max(startMs, hoverMs), startMs: Math.min(startMs, hoverMs) })]
      },
      HoveredChartTooltip: ({ lines, title, x, y }) => [
        modifyFields(state, { tooltip: () => ({ lines, title, x, y }) }),
        Option.none(),
      ],
      HoveredChartZoom: ({ ms }) => [
        modifyFields(state, {
          zoomDrag: (drag) => (drag === null ? null : modifyFields(drag, { hoverMs: () => ms })),
        }),
        Option.none(),
      ],
      StartedChartZoom: ({ ms }) => [
        modifyFields(state, { zoomDrag: () => ({ hoverMs: ms, startMs: ms }) }),
        Option.none(),
      ],
    })
  )
)
