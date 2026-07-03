import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { AuthContext, InjectionRpcs } from '#shared'
import type {
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

    const InjectionLogList = Effect.fn('rpc.injection.list')(function* (params: InjectionLogListParams) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('InjectionLogList called').pipe(
        Effect.annotateLogs({
          rpc: 'InjectionLogList',
          userId: user.id,
          startDate: params.startDate !== undefined ? DateTime.formatIso(params.startDate) : 'none',
          endDate: params.endDate !== undefined ? DateTime.formatIso(params.endDate) : 'none',
          limit: params.limit,
        })
      )
      const result = yield* repo.list(params, user.id)
      yield* Effect.logDebug('InjectionLogList completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogList', count: result.length })
      )
      return result
    })

    const InjectionLogGet = Effect.fn('rpc.injection.get')(function* ({ id }: { id: string }) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('InjectionLogGet called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogGet', id }))
      const result = yield* repo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
      yield* Effect.logDebug('InjectionLogGet completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGet', id, found: result !== null })
      )
      return result
    })

    const InjectionLogCreate = Effect.fn('rpc.injection.create')(function* (data: InjectionLogCreate) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('InjectionLogCreate called').pipe(
        Effect.annotateLogs({
          rpc: 'InjectionLogCreate',
          userId: user.id,
          drug: data.drug,
          dosage: data.dosage,
          site: Option.getOrNull(data.injectionSite) ?? 'none',
        })
      )
      const result = yield* repo.create(data, user.id)
      yield* Effect.logInfo('InjectionLogCreate completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogCreate', id: result.id, drug: result.drug })
      )
      return result
    })

    const InjectionLogUpdate = Effect.fn('rpc.injection.update')(function* (data: InjectionLogUpdate) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('InjectionLogUpdate called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: data.id })
      )
      const result = yield* repo.update(data, user.id)
      yield* Effect.logInfo('InjectionLogUpdate completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogUpdate', id: result.id })
      )
      return result
    })

    const InjectionLogDelete = Effect.fn('rpc.injection.delete')(function* ({ id }: { id: string }) {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logInfo('InjectionLogDelete called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogDelete', id }))
      const result = yield* repo.delete(id, user.id)
      yield* Effect.logInfo('InjectionLogDelete completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogDelete', id, deleted: result })
      )
      return result
    })

    const InjectionLogGetDrugs = Effect.fn('rpc.injection.getDrugs')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('InjectionLogGetDrugs called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', userId: user.id })
      )
      const result = yield* repo.getUniqueDrugs(user.id)
      yield* Effect.logDebug('InjectionLogGetDrugs completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', count: result.length })
      )
      return result
    })

    const InjectionLogGetSites = Effect.fn('rpc.injection.getSites')(function* () {
      const { user } = yield* Effect.service(AuthContext)
      yield* Effect.logDebug('InjectionLogGetSites called').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetSites', userId: user.id })
      )
      const result = yield* repo.getUniqueSites(user.id)
      yield* Effect.logDebug('InjectionLogGetSites completed').pipe(
        Effect.annotateLogs({ rpc: 'InjectionLogGetSites', count: result.length })
      )
      return result
    })

    const InjectionLogGetLastSite = Effect.fn('rpc.injection.getLastSite')(function* () {
      const { user } = yield* Effect.service(AuthContext)
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

    const InjectionLogBulkAssignSchedule = Effect.fn('rpc.injection.bulkAssignSchedule')(function* (
      data: InjectionLogBulkAssignSchedule
    ) {
      const { user } = yield* Effect.service(AuthContext)
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

    return {
      InjectionLogList,
      InjectionLogGet,
      InjectionLogCreate,
      InjectionLogUpdate,
      InjectionLogDelete,
      InjectionLogGetDrugs,
      InjectionLogGetSites,
      InjectionLogGetLastSite,
      InjectionLogBulkAssignSchedule,
    }
  })
)
