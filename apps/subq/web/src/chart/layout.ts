import type { ScaleLinear, ScaleTime } from 'd3'
import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

import { getDoseColor } from './colors.js'
import type { ChartState } from './state.js'

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
  readonly endDateExclusive: Option.Option<Date>
  readonly endDateInclusive: Option.Option<Date>
}

export interface ZoomRange {
  readonly start: Date
  readonly end: Date
}

// ============================================
// Pure layout (ported from hooks/*)
// ============================================

export const PILL = { HEIGHT: 18, MIN_GAP_X: 4, VERTICAL_GAP: 4, WIDTH: 44 } as const

export const CHART_WIDTH = 800
export const CHART_HEIGHT = 320

export interface WeightPointColored extends WeightPoint {
  readonly color: string
  readonly drug: Option.Option<string>
  readonly doseMg: Option.Option<number>
}

export interface Segment {
  readonly points: ReadonlyArray<WeightPointColored>
  readonly color: string
  readonly drug: Option.Option<string>
  readonly doseMg: Option.Option<number>
}

export interface Pill {
  readonly drug: string
  readonly doseMg: number
  readonly color: string
  readonly date: Date
  readonly weight: number
  readonly x: number
  readonly row: number
}

interface PillPlacement {
  readonly maxRow: number
  readonly placed: ReadonlyArray<Pill>
}

export interface PillLayout {
  readonly pills: ReadonlyArray<Pill>
  readonly maxRow: number
}

const emptyPillPlacement = (): PillPlacement => ({ maxRow: 0, placed: [] })

const byDate: Order.Order<{ readonly date: Date }> = Order.mapInput(
  Order.Date,
  (item: { readonly date: Date }) => item.date
)

export const bySortedDate = <T extends { readonly date: Date }>(items: ReadonlyArray<T>): Array<T> =>
  Arr.sort(items, byDate)

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

export const computeSegments: {
  (injectionData: ReadonlyArray<InjectionPoint>): (weightData: ReadonlyArray<WeightPoint>) => ReadonlyArray<Segment>
  (weightData: ReadonlyArray<WeightPoint>, injectionData: ReadonlyArray<InjectionPoint>): ReadonlyArray<Segment>
} = Function.dual(
  2,
  (weightData: ReadonlyArray<WeightPoint>, injectionData: ReadonlyArray<InjectionPoint>): ReadonlyArray<Segment> => {
    const sortedWeight = bySortedDate(weightData)
    const sortedInjections = bySortedDate(injectionData)

    const colored: ReadonlyArray<WeightPointColored> = Arr.map(sortedWeight, (point) => {
      const recent = Arr.findLast(sortedInjections, (inj) => inj.date.getTime() <= point.date.getTime())

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

      return {
        color: point.color,
        current: seed,
        doseMg: point.doseMg,
        drug: point.drug,
        segments: flushSegment(build),
      }
    })

    return flushSegment(built)
  }
)

const firstFreeRow = (occupied: HashSet.HashSet<number>, row: number): number =>
  HashSet.has(occupied, row) ? firstFreeRow(occupied, row + 1) : row

export const computePills: {
  (
    allInjections: ReadonlyArray<InjectionPoint>,
    zoom: Option.Option<ZoomRange>,
    xScale: ScaleTime<number, number>
  ): (sortedWeight: ReadonlyArray<WeightPoint>) => PillLayout
  (
    sortedWeight: ReadonlyArray<WeightPoint>,
    allInjections: ReadonlyArray<InjectionPoint>,
    zoom: Option.Option<ZoomRange>,
    xScale: ScaleTime<number, number>
  ): PillLayout
} = Function.dual(
  4,
  (
    sortedWeight: ReadonlyArray<WeightPoint>,
    allInjections: ReadonlyArray<InjectionPoint>,
    zoom: Option.Option<ZoomRange>,
    xScale: ScaleTime<number, number>
  ): PillLayout => {
    const sortedInjections = bySortedDate(allInjections)

    const visible = Option.match(zoom, {
      onNone: () => sortedInjections,
      onSome: (range) => Arr.filter(sortedInjections, (inj) => inj.date >= range.start && inj.date <= range.end),
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
        Option.all([Arr.findLast(sortedInjections, (inj) => inj.date < range.start), Arr.head(sortedWeight)]).pipe(
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

    const placement = Arr.reduce(built.pills, emptyPillPlacement(), (acc, pill) => {
      const occupied = HashSet.fromIterable(
        Arr.map(
          Arr.filter(acc.placed, (prev) => Math.abs(pill.x - prev.x) < PILL.WIDTH + PILL.MIN_GAP_X),
          (prev) => prev.row
        )
      )

      const row = firstFreeRow(occupied, 0)

      return { maxRow: Math.max(acc.maxRow, row), placed: [...acc.placed, { ...pill, row }] }
    })

    return { maxRow: placement.maxRow, pills: placement.placed }
  }
)

// Scales and derived dimensions shared by every chart layer.
export interface ChartFrame {
  readonly margin: { readonly bottom: number; readonly left: number; readonly right: number; readonly top: number }
  readonly width: number
  readonly height: number
  readonly xScale: ScaleTime<number, number>
  readonly yScale: ScaleLinear<number, number>
  readonly domainStartMs: number
  readonly domainEndMs: number
  readonly filter: ChartState['filter']
  readonly displayWeight: (lbs: number) => number
  readonly unitLabel: string
  readonly formatDate: (date: Date) => string
  readonly isSelected: (drug: Option.Option<string>, doseMg: Option.Option<number>) => boolean
}
