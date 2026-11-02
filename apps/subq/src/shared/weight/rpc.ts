import * as Rpc from 'effect/rpc/Rpc'
import * as RpcGroup from 'effect/rpc/RpcGroup'
import * as Schema from 'effect/Schema'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import {
  WeightLog,
  WeightLogCreate,
  WeightLogDatabaseError,
  WeightLogDelete,
  WeightLogListParams,
  WeightLogNotFoundError,
  WeightLogUpdate,
} from './domain.js'

// ============================================
// Weight Log RPCs
// ============================================

export const WeightRpcs = RpcGroup.make(
  Rpc.make('WeightLogList', {
    payload: WeightLogListParams,
    success: Schema.Array(WeightLog),
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(WeightLog),
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogCreate', {
    payload: WeightLogCreate,
    success: WeightLog,
    error: WeightLogDatabaseError,
  }),
  Rpc.make('WeightLogUpdate', {
    payload: WeightLogUpdate,
    success: WeightLog,
    error: Schema.Union([WeightLogNotFoundError, WeightLogDatabaseError]),
  }),
  Rpc.make('WeightLogDelete', {
    payload: WeightLogDelete,
    success: Schema.Boolean,
    error: WeightLogDatabaseError,
  })
).middleware(AuthRpcMiddleware)
