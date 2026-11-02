import * as Rpc from 'effect/rpc/Rpc'
import * as RpcGroup from 'effect/rpc/RpcGroup'
import * as Schema from 'effect/Schema'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import { DbOperation } from '../common/domain.js'
import { SettingsTimezoneNotInitialized } from '../settings/errors.js'
import { GoalId, GoalProgressResult, UserGoal, UserGoalCreate, UserGoalDelete, UserGoalUpdate } from './domain.js'

// ============================================
// Goals Errors
// ============================================

export class GoalNotFoundError extends Schema.TaggedClass<GoalNotFoundError, { readonly brand: unique symbol }>()(
  'GoalNotFoundError',
  {
    id: Schema.String,
  }
) {}

export class GoalDatabaseError extends Schema.TaggedClass<GoalDatabaseError, { readonly brand: unique symbol }>()(
  'GoalDatabaseError',
  {
    operation: DbOperation,
    cause: Schema.Defect(),
  }
) {}

export class NoWeightDataError extends Schema.TaggedClass<NoWeightDataError, { readonly brand: unique symbol }>()(
  'NoWeightDataError',
  {}
) {}

// ============================================
// Goals RPCs
// ============================================

export const GoalRpcs = RpcGroup.make(
  Rpc.make('GoalGetActive', {
    success: Schema.NullOr(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalGet', {
    payload: Schema.Struct({ id: GoalId }),
    success: Schema.NullOr(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalList', {
    success: Schema.Array(UserGoal),
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalCreate', {
    payload: UserGoalCreate,
    success: UserGoal,
    error: Schema.Union([GoalNotFoundError, GoalDatabaseError, NoWeightDataError]),
  }),
  Rpc.make('GoalUpdate', {
    payload: UserGoalUpdate,
    success: UserGoal,
    error: Schema.Union([GoalNotFoundError, GoalDatabaseError, SettingsTimezoneNotInitialized]),
  }),
  Rpc.make('GoalDelete', {
    payload: UserGoalDelete,
    success: Schema.Boolean,
    error: GoalDatabaseError,
  }),
  Rpc.make('GoalGetProgress', {
    success: GoalProgressResult,
    error: GoalDatabaseError,
  })
).middleware(AuthRpcMiddleware)
