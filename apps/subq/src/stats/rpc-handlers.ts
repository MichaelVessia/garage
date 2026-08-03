import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, StatsRpcs } from '#shared'
import type { StatsParams } from '#shared'

import { StatsService } from './stats-service.js'

export const StatsRpcHandlersLive = StatsRpcs.toLayer(
  Effect.gen(function* () {
    const service = yield* StatsService

    const GetWeightStats = authedRpc('rpc.stats.getWeightStats', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetWeightStats called').pipe(
          Effect.annotateLogs({
            rpc: 'GetWeightStats',
            userId: user.id,
            startDate: params.startDate ?? 'none',
            endDate: params.endDate ?? 'none',
          })
        )
        const result = yield* service.getWeightStats(params, user.id)
        yield* Effect.logDebug('GetWeightStats completed').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightStats', hasData: Option.isSome(result.data), timezone: result.timezone })
        )
        return { data: Option.getOrNull(result.data), timezone: result.timezone }
      })
    )

    const GetWeightTrend = authedRpc('rpc.stats.getWeightTrend', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetWeightTrend called').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightTrend', userId: user.id })
        )
        const result = yield* service.getWeightTrend(params, user.id)
        yield* Effect.logDebug('GetWeightTrend completed').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightTrend', points: result.data.points.length, timezone: result.timezone })
        )
        return result
      })
    )

    const GetInjectionSiteStats = authedRpc('rpc.stats.getInjectionSiteStats', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetInjectionSiteStats called').pipe(
          Effect.annotateLogs({ rpc: 'GetInjectionSiteStats', userId: user.id })
        )
        const result = yield* service.getInjectionSiteStats(params, user.id)
        yield* Effect.logDebug('GetInjectionSiteStats completed').pipe(
          Effect.annotateLogs({
            rpc: 'GetInjectionSiteStats',
            sitesCount: result.data.sites.length,
            timezone: result.timezone,
          })
        )
        return result
      })
    )

    const GetDoseHistory = authedRpc('rpc.stats.getDoseHistory', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetDoseHistory called').pipe(
          Effect.annotateLogs({ rpc: 'GetDoseHistory', userId: user.id })
        )
        const result = yield* service.getDoseHistory(params, user.id)
        yield* Effect.logDebug('GetDoseHistory completed').pipe(
          Effect.annotateLogs({ rpc: 'GetDoseHistory', points: result.data.points.length, timezone: result.timezone })
        )
        return result
      })
    )

    const GetInjectionFrequency = authedRpc('rpc.stats.getInjectionFrequency', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetInjectionFrequency called').pipe(
          Effect.annotateLogs({ rpc: 'GetInjectionFrequency', userId: user.id })
        )
        const result = yield* service.getInjectionFrequency(params, user.id)
        yield* Effect.logDebug('GetInjectionFrequency completed').pipe(
          Effect.annotateLogs({
            rpc: 'GetInjectionFrequency',
            hasData: Option.isSome(result.data),
            timezone: result.timezone,
          })
        )
        return { data: Option.getOrNull(result.data), timezone: result.timezone }
      })
    )

    const GetDrugBreakdown = authedRpc('rpc.stats.getDrugBreakdown', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetDrugBreakdown called').pipe(
          Effect.annotateLogs({ rpc: 'GetDrugBreakdown', userId: user.id })
        )
        const result = yield* service.getDrugBreakdown(params, user.id)
        yield* Effect.logDebug('GetDrugBreakdown completed').pipe(
          Effect.annotateLogs({
            rpc: 'GetDrugBreakdown',
            drugsCount: result.data.drugs.length,
            timezone: result.timezone,
          })
        )
        return result
      })
    )

    const GetInjectionByDayOfWeek = authedRpc('rpc.stats.getInjectionByDayOfWeek', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetInjectionByDayOfWeek called').pipe(
          Effect.annotateLogs({ rpc: 'GetInjectionByDayOfWeek', userId: user.id })
        )
        const result = yield* service.getInjectionByDayOfWeek(params, user.id)
        yield* Effect.logDebug('GetInjectionByDayOfWeek completed').pipe(
          Effect.annotateLogs({
            rpc: 'GetInjectionByDayOfWeek',
            hasData: result.data.totalInjections > 0,
            timezone: result.timezone,
          })
        )
        return result
      })
    )

    return {
      GetWeightStats,
      GetWeightTrend,
      GetInjectionSiteStats,
      GetDoseHistory,
      GetInjectionFrequency,
      GetDrugBreakdown,
      GetInjectionByDayOfWeek,
    }
  })
)
