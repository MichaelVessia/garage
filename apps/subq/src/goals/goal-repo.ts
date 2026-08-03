import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { SqlClient } from 'effect/unstable/sql'

import {
  CalendarDate,
  GoalDatabaseError,
  GoalId,
  GoalNotFoundError,
  Notes,
  SettingsTimezoneNotInitialized,
  UserGoal,
  Weight,
} from '#shared'
import type { UserGoalCreate, UserGoalUpdate } from '#shared'

import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

// ============================================
// Database Row Schemas
// ============================================

export const GoalRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  goal_weight: Schema.Number,
  starting_weight: Schema.Number,
  starting_date: CalendarDate,
  target_date: Schema.NullOr(CalendarDate),
  calendar_date_migrated: Schema.Number,
  notes: Schema.NullOr(Schema.String),
  is_active: Schema.Number,
  completed_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})
export type GoalRow = typeof GoalRow.Type

const decodeGoalRow = Schema.decodeUnknownEffect(GoalRow)

export const goalRowToDomain = (row: typeof GoalRow.Type): UserGoal =>
  new UserGoal({
    id: GoalId.make(row.id),
    goalWeight: Weight.make(row.goal_weight),
    startingWeight: Weight.make(row.starting_weight),
    startingDate: row.starting_date,
    targetDate: row.target_date,
    notes: row.notes !== null && Str.isNonEmpty(row.notes) ? Notes.make(row.notes) : null,
    isActive: row.is_active === 1,
    completedAt:
      row.completed_at !== null && Str.isNonEmpty(row.completed_at) ? DateTime.makeUnsafe(row.completed_at) : null,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

const goalUpdatePatch = (data: UserGoalUpdate) => ({
  changesPlannedDates: data.startingDate !== undefined || data.targetDate !== undefined,
  goalWeight: data.goalWeight ?? null,
  isActive: Number(data.isActive === true),
  isActiveProvided: Number(data.isActive !== undefined),
  notes: data.notes ?? null,
  notesProvided: Number(data.notes !== undefined),
  startingDate: data.startingDate ?? null,
  startingWeight: data.startingWeight ?? null,
  targetDate: data.targetDate ?? null,
  targetDateProvided: Number(data.targetDate !== undefined),
})

// ============================================
// Repository Service Definition
// ============================================

export class GoalRepo extends Context.Service<
  GoalRepo,
  {
    readonly list: (userId: string) => Effect.Effect<UserGoal[], GoalDatabaseError>
    readonly getActive: (userId: string) => Effect.Effect<Option.Option<UserGoal>, GoalDatabaseError>
    readonly findById: (id: string, userId: string) => Effect.Effect<Option.Option<UserGoal>, GoalDatabaseError>
    readonly create: (
      data: UserGoalCreate,
      startingWeight: number,
      startingDate: CalendarDate,
      userId: string
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError>
    readonly update: (
      data: UserGoalUpdate,
      userId: string
    ) => Effect.Effect<UserGoal, GoalNotFoundError | GoalDatabaseError | SettingsTimezoneNotInitialized>
    readonly delete: (id: string, userId: string) => Effect.Effect<boolean, GoalDatabaseError>
  }
>()('@garage/subq/goals/goal-repo/GoalRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const GoalRepoLive = Layer.effect(
  GoalRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const list = Effect.fn('GoalRepo.list')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `
        const decoded = yield* Effect.all(
          rows.map((r) => decodeGoalRow(r)),
          { concurrency: 1 }
        )
        return decoded.map(goalRowToDomain)
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const getActive = Effect.fn('GoalRepo.getActive')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE user_id = ${userId} AND is_active = 1
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeGoalRow(rows[0])
        return Option.some(goalRowToDomain(decoded))
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const findById = Effect.fn('GoalRepo.findById')(
      function* (id: string, userId: string) {
        const rows = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals
          WHERE id = ${id} AND user_id = ${userId}
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeGoalRow(rows[0])
        return Option.some(goalRowToDomain(decoded))
      },
      mapDbError(GoalDatabaseError, 'query')
    )

    const create = Effect.fn('GoalRepo.create')(function* (
      data: UserGoalCreate,
      startingWeight: number,
      startingDate: CalendarDate,
      userId: string
    ) {
      const id = yield* randomUuid()
      const now = DateTime.formatIso(yield* DateTime.now)
      const targetDate = Option.isSome(data.targetDate) ? data.targetDate.value : null
      const notes = Option.isSome(data.notes) ? data.notes.value : null

      // Deactivate any existing active goals for this user
      yield* sql`UPDATE user_goals SET is_active = 0, updated_at = ${now} WHERE user_id = ${userId} AND is_active = 1`.pipe(
        mapDbError(GoalDatabaseError, 'update')
      )

      // Create the goal
      yield* sql`
          INSERT INTO user_goals (
            id, user_id, goal_weight, starting_weight, starting_date, target_date,
            calendar_date_migrated, notes, is_active, created_at, updated_at
          )
          VALUES (${id}, ${userId}, ${data.goalWeight}, ${startingWeight}, ${startingDate}, ${targetDate}, 1, ${notes}, 1, ${now}, ${now})
        `.pipe(mapDbError(GoalDatabaseError, 'insert'))

      // Fetch and return the created goal
      const result = yield* findById(id, userId)
      return yield* Option.match(result, {
        onNone: () => Effect.fail(GoalNotFoundError.make({ id })),
        onSome: (goal) => Effect.succeed(goal),
      })
    })

    const update = Effect.fn('GoalRepo.update')(function* (data: UserGoalUpdate, userId: string) {
      // First get current values - include user_id check to prevent IDOR
      const current = yield* sql`
          SELECT id, user_id, goal_weight, starting_weight, starting_date,
                 target_date, calendar_date_migrated, notes, is_active, completed_at, created_at, updated_at
          FROM user_goals WHERE id = ${data.id} AND user_id = ${userId}
        `.pipe(mapDbError(GoalDatabaseError, 'query'))

      if (Arr.isReadonlyArrayEmpty(current)) {
        return yield* Effect.fail(GoalNotFoundError.make({ id: data.id }))
      }

      const curr = yield* decodeGoalRow(current[0]).pipe(mapDbError(GoalDatabaseError, 'query'))
      const patch = goalUpdatePatch(data)
      if (patch.changesPlannedDates && curr.calendar_date_migrated !== 1) {
        return yield* new SettingsTimezoneNotInitialized({ userId })
      }

      const now = DateTime.formatIso(yield* DateTime.now)

      // If activating this goal, deactivate others
      if (patch.isActive === 1 && curr.is_active !== 1) {
        yield* sql`
            UPDATE user_goals SET is_active = 0, updated_at = ${now}
            WHERE user_id = ${userId} AND is_active = 1 AND id != ${data.id}
          `.pipe(mapDbError(GoalDatabaseError, 'update'))
      }

      const patchFields = patch.changesPlannedDates
        ? sql`
            UPDATE user_goals
            SET goal_weight = COALESCE(${patch.goalWeight}, goal_weight),
                starting_weight = COALESCE(${patch.startingWeight}, starting_weight),
                starting_date = COALESCE(${patch.startingDate}, starting_date),
                target_date = CASE
                  WHEN ${patch.targetDateProvided} = 1 THEN ${patch.targetDate}
                  ELSE target_date
                END,
                calendar_date_migrated = 1,
                notes = CASE
                  WHEN ${patch.notesProvided} = 1 THEN ${patch.notes}
                  ELSE notes
                END,
                is_active = CASE
                  WHEN ${patch.isActiveProvided} = 1 THEN ${patch.isActive}
                  ELSE is_active
                END,
                updated_at = ${now}
            WHERE id = ${data.id} AND user_id = ${userId}
          `
        : sql`
            UPDATE user_goals
            SET goal_weight = COALESCE(${patch.goalWeight}, goal_weight),
                starting_weight = COALESCE(${patch.startingWeight}, starting_weight),
                notes = CASE
                  WHEN ${patch.notesProvided} = 1 THEN ${patch.notes}
                  ELSE notes
                END,
                is_active = CASE
                  WHEN ${patch.isActiveProvided} = 1 THEN ${patch.isActive}
                  ELSE is_active
                END,
                updated_at = ${now}
            WHERE id = ${data.id} AND user_id = ${userId}
          `
      yield* patchFields.pipe(mapDbError(GoalDatabaseError, 'update'))

      // Fetch updated
      const result = yield* findById(data.id, userId)
      return yield* Option.match(result, {
        onNone: () => Effect.fail(GoalNotFoundError.make({ id: data.id })),
        onSome: (goal) => Effect.succeed(goal),
      })
    })

    const del = Effect.fn('GoalRepo.delete')(
      function* (id: string, userId: string) {
        const existing = yield* sql`SELECT id FROM user_goals WHERE id = ${id} AND user_id = ${userId}`
        if (Arr.isReadonlyArrayEmpty(existing)) {
          return false
        }
        yield* sql`DELETE FROM user_goals WHERE id = ${id} AND user_id = ${userId}`
        return true
      },
      mapDbError(GoalDatabaseError, 'delete')
    )

    return {
      list,
      getActive,
      findById,
      create,
      update,
      delete: del,
    }
  })
)
