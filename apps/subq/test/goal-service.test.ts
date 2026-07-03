import { describe, expect, it } from '@effect/vitest'
import { DateTime, Effect, Layer } from 'effect'
import { SqlClient } from 'effect/unstable/sql'

import { GoalRepoLive } from '../src/goals/goal-repo.js'
import { GoalService, GoalServiceLive } from '../src/goals/goal-service.js'
import { testDate } from './helpers/dates.js'
import { insertWeightLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(GoalServiceLive.pipe(Layer.provide(GoalRepoLive)))
const MS_PER_DAY = 24 * 60 * 60 * 1000

const insertGoal = (params: {
  readonly id: string
  readonly userId: string
  readonly goalWeight: number
  readonly startingWeight: number
  readonly startingDate: Date
  readonly targetDate: Date | null
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(DateTime.makeUnsafe('2024-01-01T00:00:00Z'))
    yield* sql`
      INSERT INTO user_goals (id, user_id, goal_weight, starting_weight, starting_date, target_date, notes, is_active, completed_at, created_at, updated_at)
      VALUES (${params.id}, ${params.userId}, ${params.goalWeight}, ${params.startingWeight}, ${params.startingDate.toISOString()}, ${params.targetDate?.toISOString() ?? null}, null, 1, null, ${now}, ${now})
    `
  })

describe('GoalService', () => {
  it.effect('uses Weight Trajectory for Goal Progress rate, projection, and pace', () =>
    Effect.gen(function* () {
      const userId = 'user-trajectory'

      const now = yield* DateTime.now
      const nowMillis = DateTime.toEpochMillis(now)

      yield* insertGoal({
        id: 'goal-1',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: testDate('2024-01-01T00:00:00Z'),
        targetDate: DateTime.toDate(DateTime.makeUnsafe(nowMillis + 365 * MS_PER_DAY)),
      })
      yield* insertWeightLog('w1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w2', testDate('2024-01-08T00:00:00Z'), 195, userId)
      yield* insertWeightLog('w3', testDate('2024-01-15T00:00:00Z'), 190, userId)

      const service = yield* GoalService
      const earliestProjection = nowMillis + 14 * MS_PER_DAY - 1000
      const progress = yield* service.getGoalProgress(userId)
      const latestProjection = nowMillis + 14 * MS_PER_DAY + 1000

      expect(progress).not.toBeNull()
      if (progress === null) {
        return
      }

      expect(progress.avgLbsPerWeek).toBeCloseTo(5)
      expect(progress.paceStatus).toBe('ahead')
      expect(progress.projectedDate).not.toBeNull()
      if (progress.projectedDate === null) {
        return
      }
      expect(DateTime.toEpochMillis(progress.projectedDate)).toBeGreaterThanOrEqual(earliestProjection)
      expect(DateTime.toEpochMillis(progress.projectedDate)).toBeLessThanOrEqual(latestProjection)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('reads fresh User Goal changes when calculating Goal Progress', () =>
    Effect.gen(function* () {
      const userId = 'user-fresh-goal-progress'

      yield* insertGoal({
        id: 'goal-freshness',
        userId,
        goalWeight: 180,
        startingWeight: 200,
        startingDate: testDate('2024-01-01T00:00:00Z'),
        targetDate: null,
      })
      yield* insertWeightLog('w-fresh-1', testDate('2024-01-01T00:00:00Z'), 200, userId)
      yield* insertWeightLog('w-fresh-2', testDate('2024-01-08T00:00:00Z'), 190, userId)

      const service = yield* GoalService
      const before = yield* service.getGoalProgress(userId)

      expect(before).not.toBeNull()
      if (before === null) {
        return
      }
      expect(before.lbsRemaining).toBe(10)
      expect(before.percentComplete).toBe(50)

      const sql = yield* SqlClient.SqlClient
      yield* sql`
        UPDATE user_goals
        SET goal_weight = 170
        WHERE id = 'goal-freshness' AND user_id = ${userId}
      `

      const after = yield* service.getGoalProgress(userId)

      expect(after).not.toBeNull()
      if (after === null) {
        return
      }
      expect(after.lbsRemaining).toBe(20)
      expect(after.percentComplete).toBeCloseTo(33.333, 3)
    }).pipe(Effect.provide(TestLayer))
  )
})
