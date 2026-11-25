import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { calendarDaysBetween, projectInstantToCalendarDate, CalendarDate } from './Calendar.ts'
import type { IanaTimezone } from './Calendar.ts'
import { Goal } from './Journal/JournalRecords.ts'
import { PaceStatus, PercentComplete, WeightLbs } from './Values.ts'
import { calculateWeightTrajectory, projectWeightTrajectoryDate } from './WeightMath.ts'
import type { WeightTrajectoryPoint } from './WeightMath.ts'

export const GoalProgress = Schema.Struct({
  goal: Goal,
  currentWeightLbs: WeightLbs,
  lbsLost: Schema.Finite,
  lbsRemaining: Schema.Finite,
  percentComplete: PercentComplete,
  projectedDate: Schema.NullOr(CalendarDate),
  paceStatus: PaceStatus,
  daysOnPlan: Schema.Int,
  avgLbsPerWeek: Schema.Finite,
})
export type GoalProgress = typeof GoalProgress.Type

const DAYS_PER_WEEK = 7

const DEFAULT_MAX_PROJECTION_DAYS = 5 * 365

export interface BuildGoalProgressParams {
  readonly goal: Goal
  readonly currentWeightLbs: number
  readonly weightHistory: ReadonlyArray<WeightTrajectoryPoint>
  readonly now: Date
  readonly timezone: IanaTimezone
  readonly maxProjectionDays?: number
}

export interface GoalProgressPaceStatusParams {
  readonly goal: Goal
  readonly currentWeightLbs: number
  readonly rateOfChange: number
  readonly today: CalendarDate
}

export const calculateGoalProgressProjectedDate = ({
  goal,
  currentWeightLbs,
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
    currentWeightLbs,
    targetWeightLbs: goal.goalWeightLbs,
    rateOfChange,
    now,
    maxProjectionDays,
  })

  return Option.map(projectedDate, (date) => projectInstantToCalendarDate(DateTime.makeUnsafe(date), timezone))
}

export const calculateGoalProgressPaceStatus = ({
  goal,
  currentWeightLbs,
  rateOfChange,
  today,
}: GoalProgressPaceStatusParams): PaceStatus => {
  const remainingLbs = currentWeightLbs - goal.goalWeightLbs

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
  currentWeightLbs,
  weightHistory,
  now,
  timezone,
  maxProjectionDays,
}: BuildGoalProgressParams): GoalProgress => {
  const trajectory = calculateWeightTrajectory(weightHistory)
  const { rateOfChange } = trajectory
  const lbsLost = goal.startingWeightLbs - currentWeightLbs
  const totalToLose = goal.startingWeightLbs - goal.goalWeightLbs
  const lbsRemaining = Math.max(0, currentWeightLbs - goal.goalWeightLbs)
  const percentComplete = totalToLose > 0 ? (lbsLost / totalToLose) * 100 : 0

  const projectedDate =
    maxProjectionDays === undefined
      ? calculateGoalProgressProjectedDate({
          goal,
          currentWeightLbs,
          rateOfChange,
          now,
          timezone,
        })
      : calculateGoalProgressProjectedDate({
          goal,
          currentWeightLbs,
          rateOfChange,
          now,
          timezone,
          maxProjectionDays,
        })

  const today = projectInstantToCalendarDate(DateTime.makeUnsafe(now), timezone)
  const paceStatus = calculateGoalProgressPaceStatus({ goal, currentWeightLbs, rateOfChange, today })
  const daysOnPlan = calendarDaysBetween(goal.startingDate, today)
  const avgLbsPerWeek = rateOfChange < 0 ? Math.abs(rateOfChange) : 0

  return GoalProgress.make({
    goal,
    currentWeightLbs: WeightLbs.make(currentWeightLbs),
    lbsLost,
    lbsRemaining,
    percentComplete: PercentComplete.make(percentComplete),
    projectedDate: Option.getOrNull(projectedDate),
    paceStatus,
    daysOnPlan,
    avgLbsPerWeek,
  })
}
