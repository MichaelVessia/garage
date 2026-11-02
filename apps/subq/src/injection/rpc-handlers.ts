import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, InjectionRpcs } from '#shared'
import type {
  AuthUser,
  InjectionLogBulkAssignSchedule,
  InjectionLogCreate,
  InjectionLogListParams,
  InjectionLogUpdate,
} from '#shared'

import { InjectionLogRepo } from './injection-log-repo.js'
import { ScheduleAssignment } from './schedule-assignment.js'

export const InjectionRpcHandlersLive = InjectionRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    const scheduleAssignment = yield* ScheduleAssignment

    const InjectionLogList = authedRpc(
      Effect.fn('rpc.injection.list')(function* (user: AuthUser, params: InjectionLogListParams) {
        yield* Effect.logDebug('InjectionLogList called').pipe(
          Effect.annotateLogs({
            rpc: 'InjectionLogList',
            userId: user.id,
            startDate: params.startDate === undefined ? 'none' : DateTime.formatIso(params.startDate),
            endDate: params.endDate === undefined ? 'none' : DateTime.formatIso(params.endDate),
            limit: params.limit,
          })
        )
        const result = yield* repo.list(params, user.id)
        yield* Effect.logDebug('InjectionLogList completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogList', count: result.length })
        )

        return result
      })
    )

    const InjectionLogGet = authedRpc(
      Effect.fn('rpc.injection.get')(function* (user: AuthUser, { id }: { id: string }) {
        yield* Effect.logDebug('InjectionLogGet called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogGet', id }))
        const result = yield* repo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('InjectionLogGet completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGet', id, found: result !== null })
        )

        return result
      })
    )

    const InjectionLogCreate = authedRpc(
      Effect.fn('rpc.injection.create')(function* (user: AuthUser, data: InjectionLogCreate) {
        yield* Effect.logInfo('InjectionLogCreate called').pipe(
          Effect.annotateLogs({
            rpc: 'InjectionLogCreate',
            userId: user.id,
            drug: data.drug,
            doseMg: data.doseMg,
            site: Option.getOrNull(data.injectionSite) ?? 'none',
          })
        )
        const result = yield* repo.create(data, user.id)
        yield* Effect.logInfo('InjectionLogCreate completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogCreate', id: result.id, drug: result.drug })
        )

        return result
      })
    )

    const InjectionLogUpdate = authedRpc(
      Effect.fn('rpc.injection.update')(function* (user: AuthUser, data: InjectionLogUpdate) {
        yield* Effect.logInfo('InjectionLogUpdate called').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: data.id })
        )
        const result = yield* repo.update(data, user.id)
        yield* Effect.logInfo('InjectionLogUpdate completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: result.id })
        )

        return result
      })
    )

    const InjectionLogDelete = authedRpc(
      Effect.fn('rpc.injection.delete')(function* (user: AuthUser, { id }: { id: string }) {
        yield* Effect.logInfo('InjectionLogDelete called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogDelete', id }))
        const result = yield* repo.delete(id, user.id)
        yield* Effect.logInfo('InjectionLogDelete completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogDelete', id, deleted: result })
        )

        return result
      })
    )

    const InjectionLogGetSites = authedRpc(
      Effect.fn('rpc.injection.getSites')(function* (user: AuthUser) {
        yield* Effect.logDebug('InjectionLogGetSites called').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetSites', userId: user.id })
        )
        const result = yield* repo.getUniqueSites(user.id)
        yield* Effect.logDebug('InjectionLogGetSites completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetSites', count: result.length })
        )

        return result
      })
    )

    const InjectionLogGetLastSite = authedRpc(
      Effect.fn('rpc.injection.getLastSite')(function* (user: AuthUser) {
        yield* Effect.logDebug('InjectionLogGetLastSite called').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetLastSite', userId: user.id })
        )
        const result = yield* repo.getLastSite(user.id)
        const site = Option.getOrNull(result)
        yield* Effect.logDebug('InjectionLogGetLastSite completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetLastSite', site: site ?? 'none' })
        )

        return site
      })
    )

    const InjectionLogBulkAssignSchedule = authedRpc(
      Effect.fn('rpc.injection.bulkAssignSchedule')(function* (user: AuthUser, data: InjectionLogBulkAssignSchedule) {
        yield* Effect.logInfo('InjectionLogBulkAssignSchedule called').pipe(
          Effect.annotateLogs({
            rpc: 'InjectionLogBulkAssignSchedule',
            userId: user.id,
            idsCount: data.ids.length,
            scheduleId: data.scheduleId ?? 'null',
          })
        )
        const result = yield* scheduleAssignment.assign(data, user.id)
        yield* Effect.logInfo('InjectionLogBulkAssignSchedule completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogBulkAssignSchedule', updated: result })
        )

        return result
      })
    )

    return {
      InjectionLogList,
      InjectionLogGet,
      InjectionLogCreate,
      InjectionLogUpdate,
      InjectionLogDelete,
      InjectionLogGetSites,
      InjectionLogGetLastSite,
      InjectionLogBulkAssignSchedule,
    }
  })
)
