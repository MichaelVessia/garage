import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import {
  DoseHistoryStats,
  DrugBreakdownStats,
  InjectionDayOfWeekStats,
  InjectionFrequencyStats,
  InjectionSiteStats,
  StatsDatabaseError,
  StatsParams,
  WeightStats,
  WeightTrendStats,
} from './domain.js'

// ============================================
// Stats RPCs
// ============================================

export const StatsRpcs = RpcGroup.make(
  Rpc.make('GetWeightStats', {
    payload: StatsParams,
    success: Schema.NullOr(WeightStats),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetWeightTrend', {
    payload: StatsParams,
    success: WeightTrendStats,
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionSiteStats', {
    payload: StatsParams,
    success: InjectionSiteStats,
    error: StatsDatabaseError,
  }),
  Rpc.make('GetDoseHistory', {
    payload: StatsParams,
    success: DoseHistoryStats,
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionFrequency', {
    payload: StatsParams,
    success: Schema.NullOr(InjectionFrequencyStats),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetDrugBreakdown', {
    payload: StatsParams,
    success: DrugBreakdownStats,
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionByDayOfWeek', {
    payload: StatsParams,
    success: InjectionDayOfWeekStats,
    error: StatsDatabaseError,
  })
).middleware(AuthRpcMiddleware)
