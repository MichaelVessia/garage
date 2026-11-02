import * as Rpc from 'effect/rpc/Rpc'
import * as RpcGroup from 'effect/rpc/RpcGroup'
import * as Schema from 'effect/Schema'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import {
  InjectionLogDatabaseError,
  InjectionLogNotFoundError,
  InjectionLog,
  InjectionLogBulkAssignSchedule,
  InjectionLogCreate,
  InjectionLogDelete,
  InjectionLogListParams,
  InjectionLogUpdate,
  ScheduleAssignmentTargetNotFoundError,
} from './domain.js'

// ============================================
// Injection Log RPCs
// ============================================

export const InjectionRpcs = RpcGroup.make(
  Rpc.make('InjectionLogList', {
    payload: InjectionLogListParams,
    success: Schema.Array(InjectionLog),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGet', {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(InjectionLog),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogCreate', {
    payload: InjectionLogCreate,
    success: InjectionLog,
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogUpdate', {
    payload: InjectionLogUpdate,
    success: InjectionLog,
    error: Schema.Union([InjectionLogNotFoundError, InjectionLogDatabaseError]),
  }),
  Rpc.make('InjectionLogDelete', {
    payload: InjectionLogDelete,
    success: Schema.Boolean,
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGetSites', {
    success: Schema.Array(Schema.String),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogGetLastSite', {
    success: Schema.NullOr(Schema.String),
    error: InjectionLogDatabaseError,
  }),
  Rpc.make('InjectionLogBulkAssignSchedule', {
    payload: InjectionLogBulkAssignSchedule,
    success: Schema.Int,
    error: Schema.Union([InjectionLogDatabaseError, ScheduleAssignmentTargetNotFoundError]),
  })
).middleware(AuthRpcMiddleware)
