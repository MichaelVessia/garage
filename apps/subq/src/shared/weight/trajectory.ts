import { DateTime } from 'effect'

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
  readonly regression: WeightTrajectoryRegression | null
  readonly rateOfChange: number
  readonly trendLine: WeightTrajectoryTrendLine | null
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

const neutralWeightTrajectory = (): WeightTrajectory => ({
  regression: null,
  rateOfChange: 0,
  trendLine: null,
})

export const calculateWeightTrajectory = (points: readonly WeightTrajectoryPoint[]): WeightTrajectory => {
  if (points.length < 2) {
    return neutralWeightTrajectory()
  }

  const orderedPoints = [...points].toSorted((a, b) => a.date.getTime() - b.date.getTime())
  const [firstPoint] = orderedPoints
  const lastPoint = orderedPoints.at(-1)
  if (firstPoint === undefined || lastPoint === undefined) {
    return neutralWeightTrajectory()
  }

  const epochOffset = firstPoint.date.getTime()
  const pointCount = orderedPoints.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  for (const point of orderedPoints) {
    const x = point.date.getTime() - epochOffset
    sumX += x
    sumY += point.weight
    sumXY += x * point.weight
    sumX2 += x * x
  }

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
    regression,
    rateOfChange: slope * WEIGHT_TRAJECTORY_MS_PER_WEEK,
    trendLine: {
      ...regression,
      startDate: firstPoint.date,
      startWeight,
      endDate: lastPoint.date,
      endWeight,
    },
  }
}

export const projectWeightTrajectoryDate = ({
  currentWeight,
  targetWeight,
  rateOfChange,
  now,
  maxProjectionDays,
}: WeightTrajectoryProjectionParams): Date | null => {
  if (currentWeight <= targetWeight) {
    return now
  }
  if (rateOfChange >= 0) {
    return null
  }

  const weeksToTarget = (currentWeight - targetWeight) / Math.abs(rateOfChange)
  const projectedMillis = now.getTime() + weeksToTarget * WEIGHT_TRAJECTORY_MS_PER_WEEK

  if (maxProjectionDays !== undefined && projectedMillis > now.getTime() + maxProjectionDays * MS_PER_DAY) {
    return null
  }

  return DateTime.toDate(DateTime.makeUnsafe(projectedMillis))
}
