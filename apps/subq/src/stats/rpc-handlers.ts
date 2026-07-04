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
            startDate: params.startDate?.toISOString() ?? 'none',
            endDate: params.endDate?.toISOString() ?? 'none',
          })
        )
        const result = yield* service.getWeightStats(params, user.id)
        yield* Effect.logDebug('GetWeightStats completed').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightStats', hasData: Option.isSome(result) })
        )
        return Option.getOrNull(result)
      })
    )

    const GetWeightTrend = authedRpc('rpc.stats.getWeightTrend', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetWeightTrend called').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightTrend', userId: user.id })
        )
        const result = yield* service.getWeightTrend(params, user.id)
        yield* Effect.logDebug('GetWeightTrend completed').pipe(
          Effect.annotateLogs({ rpc: 'GetWeightTrend', points: result?.points.length ?? 0 })
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
            sitesCount: result?.sites.length ?? 0,
          })
        )
        return result
      })
    )

    const GetDosageHistory = authedRpc('rpc.stats.getDosageHistory', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetDosageHistory called').pipe(
          Effect.annotateLogs({ rpc: 'GetDosageHistory', userId: user.id })
        )
        const result = yield* service.getDosageHistory(params, user.id)
        yield* Effect.logDebug('GetDosageHistory completed').pipe(
          Effect.annotateLogs({ rpc: 'GetDosageHistory', points: result?.points.length ?? 0 })
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
          Effect.annotateLogs({ rpc: 'GetInjectionFrequency', hasData: Option.isSome(result) })
        )
        return Option.getOrNull(result)
      })
    )

    const GetDrugBreakdown = authedRpc('rpc.stats.getDrugBreakdown', (user, params: StatsParams) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GetDrugBreakdown called').pipe(
          Effect.annotateLogs({ rpc: 'GetDrugBreakdown', userId: user.id })
        )
        const result = yield* service.getDrugBreakdown(params, user.id)
        yield* Effect.logDebug('GetDrugBreakdown completed').pipe(
          Effect.annotateLogs({ rpc: 'GetDrugBreakdown', drugsCount: result?.drugs.length ?? 0 })
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
          Effect.annotateLogs({ rpc: 'GetInjectionByDayOfWeek', hasData: result !== null })
        )
        return result
      })
    )

    return {
      GetWeightStats,
      GetWeightTrend,
      GetInjectionSiteStats,
      GetDosageHistory,
      GetInjectionFrequency,
      GetDrugBreakdown,
      GetInjectionByDayOfWeek,
    }
  })
)
