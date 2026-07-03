import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

export interface WeightTrajectoryPoint {
  readonly date: Date
  readonly weight: number
}

export interface WeightTrajectoryRegression {
  /** Pounds per millisecond. */
  readonly slope: number
  /** Projected weight at Unix epoch. */
  readonly intercept: number
}

export interface WeightTrajectoryTrendLine extends WeightTrajectoryRegression {
  readonly startDate: Date
  readonly startWeight: number
  readonly endDate: Date
  readonly endWeight: number
}

export interface WeightTrajectory {
  readonly regression: Option.Option<WeightTrajectoryRegression>
  readonly rateOfChange: number
  readonly trendLine: Option.Option<WeightTrajectoryTrendLine>
}

export interface WeightTrajectoryProjectionParams {
  readonly currentWeight: number
  readonly targetWeight: number
  readonly rateOfChange: number
  readonly now: Date
  readonly maxProjectionDays?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
export const WEIGHT_TRAJECTORY_MS_PER_WEEK = 7 * MS_PER_DAY

interface RegressionSums {
  readonly sumX: number
  readonly sumY: number
  readonly sumXY: number
  readonly sumX2: number
}

const neutralWeightTrajectory = (): WeightTrajectory => ({
  regression: Option.none(),
  rateOfChange: 0,
  trendLine: Option.none(),
})

export const calculateWeightTrajectory = (points: readonly WeightTrajectoryPoint[]): WeightTrajectory => {
  if (points.length < 2 || !Arr.isReadonlyArrayNonEmpty(points)) {
    return neutralWeightTrajectory()
  }

  const orderedPoints = Arr.sortWith(points, (point) => point.date.getTime(), Order.Number)
  const firstPoint = Arr.headNonEmpty(orderedPoints)
  const lastPoint = Arr.lastNonEmpty(orderedPoints)

  const epochOffset = firstPoint.date.getTime()
  const pointCount = orderedPoints.length
  const initialSums: RegressionSums = { sumX: 0, sumY: 0, sumXY: 0, sumX2: 0 }
  const { sumX, sumY, sumXY, sumX2 } = Arr.reduce(orderedPoints, initialSums, (sums, point) => {
    const x = point.date.getTime() - epochOffset
    return {
      sumX: sums.sumX + x,
      sumY: sums.sumY + point.weight,
      sumXY: sums.sumXY + x * point.weight,
      sumX2: sums.sumX2 + x * x,
    }
  })

  const denominator = pointCount * sumX2 - sumX * sumX
  if (denominator === 0) {
    return neutralWeightTrajectory()
  }

  const slope = (pointCount * sumXY - sumX * sumY) / denominator
  const interceptAtOffset = (sumY - slope * sumX) / pointCount
  const intercept = interceptAtOffset - slope * epochOffset
  const regression = { slope, intercept }
  const startWeight = slope * firstPoint.date.getTime() + intercept
  const endWeight = slope * lastPoint.date.getTime() + intercept

  return {
    regression: Option.some(regression),
    rateOfChange: slope * WEIGHT_TRAJECTORY_MS_PER_WEEK,
    trendLine: Option.some({
      ...regression,
      startDate: firstPoint.date,
      startWeight,
      endDate: lastPoint.date,
      endWeight,
    }),
  }
}

export const projectWeightTrajectoryDate = ({
  currentWeight,
  targetWeight,
  rateOfChange,
  now,
  maxProjectionDays,
}: WeightTrajectoryProjectionParams): Option.Option<Date> => {
  if (currentWeight <= targetWeight) {
    return Option.some(now)
  }
  if (rateOfChange >= 0) {
    return Option.none()
  }

  const weeksToTarget = (currentWeight - targetWeight) / Math.abs(rateOfChange)
  const projectedMillis = now.getTime() + weeksToTarget * WEIGHT_TRAJECTORY_MS_PER_WEEK

  if (maxProjectionDays !== undefined && projectedMillis > now.getTime() + maxProjectionDays * MS_PER_DAY) {
    return Option.none()
  }

  const projected = DateTime.makeUnsafe(projectedMillis)
  return projected.pipe(DateTime.toDate, Option.some)
}
