import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import { calendarDaysBetween, projectInstantToCalendarDate } from '../calendar/domain.js'
import type { CalendarDate, IanaTimezone } from '../calendar/domain.js'
import { Weight } from '../weight/domain.js'
import { calculateWeightTrajectory, projectWeightTrajectoryDate } from '../weight/trajectory.js'
import type { WeightTrajectoryPoint } from '../weight/trajectory.js'
import { GoalProgress, PercentComplete } from './domain.js'
import type { PaceStatus, UserGoal } from './domain.js'

const DAYS_PER_WEEK = 7
const DEFAULT_MAX_PROJECTION_DAYS = 5 * 365

export interface BuildGoalProgressParams {
  readonly goal: UserGoal
  readonly currentWeight: number
  readonly weightHistory: readonly WeightTrajectoryPoint[]
  readonly now: Date
  readonly timezone: IanaTimezone
  readonly maxProjectionDays?: number
}

export interface GoalProgressPaceStatusParams {
  readonly goal: UserGoal
  readonly currentWeight: number
  readonly rateOfChange: number
  readonly today: CalendarDate
}

export const calculateGoalProgressProjectedDate = ({
  goal,
  currentWeight,
  rateOfChange,
  now,
  timezone,
  maxProjectionDays = DEFAULT_MAX_PROJECTION_DAYS,
}: Omit<GoalProgressPaceStatusParams, 'today'> & {
  readonly now: Date
  readonly timezone: IanaTimezone
  readonly maxProjectionDays?: number
}): Option.Option<CalendarDate> => {
  const projectedDate = projectWeightTrajectoryDate({
    currentWeight,
    targetWeight: goal.goalWeight,
    rateOfChange,
    now,
    maxProjectionDays,
  })

  return Option.map(projectedDate, (date) => projectInstantToCalendarDate(DateTime.makeUnsafe(date), timezone))
}

export const calculateGoalProgressPaceStatus = ({
  goal,
  currentWeight,
  rateOfChange,
  today,
}: GoalProgressPaceStatusParams): PaceStatus => {
  const remainingLbs = currentWeight - goal.goalWeight
  if (remainingLbs <= 0) {
    return 'ahead'
  }

  if (rateOfChange >= 0) {
    return 'not_losing'
  }

  if (goal.targetDate === null) {
    return 'on_track'
  }

  const daysRemaining = calendarDaysBetween(today, goal.targetDate)
  if (daysRemaining <= 0) {
    return 'behind'
  }

  const weeksRemaining = daysRemaining / DAYS_PER_WEEK
  const requiredRate = remainingLbs / weeksRemaining
  const actualRate = Math.abs(rateOfChange)
  const tolerance = 0.1

  if (actualRate >= requiredRate * (1 + tolerance)) {
    return 'ahead'
  }
  if (actualRate >= requiredRate * (1 - tolerance)) {
    return 'on_track'
  }
  return 'behind'
}

export const buildGoalProgress = ({
  goal,
  currentWeight,
  weightHistory,
  now,
  timezone,
  maxProjectionDays,
}: BuildGoalProgressParams): GoalProgress => {
  const trajectory = calculateWeightTrajectory(weightHistory)
  const { rateOfChange } = trajectory
  const lbsLost = goal.startingWeight - currentWeight
  const totalToLose = goal.startingWeight - goal.goalWeight
  const lbsRemaining = Math.max(0, currentWeight - goal.goalWeight)
  const percentComplete = totalToLose > 0 ? (lbsLost / totalToLose) * 100 : 0
  const projectedDate =
    maxProjectionDays === undefined
      ? calculateGoalProgressProjectedDate({
          goal,
          currentWeight,
          rateOfChange,
          now,
          timezone,
        })
      : calculateGoalProgressProjectedDate({
          goal,
          currentWeight,
          rateOfChange,
          now,
          timezone,
          maxProjectionDays,
        })
  const today = projectInstantToCalendarDate(DateTime.makeUnsafe(now), timezone)
  const paceStatus = calculateGoalProgressPaceStatus({ goal, currentWeight, rateOfChange, today })
  const daysOnPlan = calendarDaysBetween(goal.startingDate, today)
  const avgLbsPerWeek = rateOfChange < 0 ? Math.abs(rateOfChange) : 0

  return new GoalProgress({
    goal,
    currentWeight: Weight.make(currentWeight),
    lbsLost,
    lbsRemaining,
    percentComplete: PercentComplete.make(percentComplete),
    projectedDate: Option.getOrNull(projectedDate),
    paceStatus,
    daysOnPlan,
    avgLbsPerWeek,
  })
}
