import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import { IanaTimezone } from '../calendar/domain.js'
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
    success: Schema.Struct({ data: Schema.NullOr(WeightStats), timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetWeightTrend', {
    payload: StatsParams,
    success: Schema.Struct({ data: WeightTrendStats, timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionSiteStats', {
    payload: StatsParams,
    success: Schema.Struct({ data: InjectionSiteStats, timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetDoseHistory', {
    payload: StatsParams,
    success: Schema.Struct({ data: DoseHistoryStats, timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionFrequency', {
    payload: StatsParams,
    success: Schema.Struct({ data: Schema.NullOr(InjectionFrequencyStats), timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetDrugBreakdown', {
    payload: StatsParams,
    success: Schema.Struct({ data: DrugBreakdownStats, timezone: IanaTimezone }),
    error: StatsDatabaseError,
  }),
  Rpc.make('GetInjectionByDayOfWeek', {
    payload: StatsParams,
    success: Schema.Struct({ data: InjectionDayOfWeekStats, timezone: IanaTimezone }),
    error: StatsDatabaseError,
  })
).middleware(AuthRpcMiddleware)
