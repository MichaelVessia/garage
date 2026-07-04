import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, InjectionRpcs } from '#shared'
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

    const InjectionLogList = authedRpc('rpc.injection.list', (user, params: InjectionLogListParams) =>
      Effect.gen(function* () {
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
    )

    const InjectionLogGet = authedRpc('rpc.injection.get', (user, { id }: { id: string }) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('InjectionLogGet called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogGet', id }))
        const result = yield* repo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('InjectionLogGet completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGet', id, found: result !== null })
        )
        return result
      })
    )

    const InjectionLogCreate = authedRpc('rpc.injection.create', (user, data: InjectionLogCreate) =>
      Effect.gen(function* () {
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
    )

    const InjectionLogUpdate = authedRpc('rpc.injection.update', (user, data: InjectionLogUpdate) =>
      Effect.gen(function* () {
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

    const InjectionLogDelete = authedRpc('rpc.injection.delete', (user, { id }: { id: string }) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('InjectionLogDelete called').pipe(Effect.annotateLogs({ rpc: 'InjectionLogDelete', id }))
        const result = yield* repo.delete(id, user.id)
        yield* Effect.logInfo('InjectionLogDelete completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogDelete', id, deleted: result })
        )
        return result
      })
    )

    const InjectionLogGetDrugs = authedRpc('rpc.injection.getDrugs', (user) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('InjectionLogGetDrugs called').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', userId: user.id })
        )
        const result = yield* repo.getUniqueDrugs(user.id)
        yield* Effect.logDebug('InjectionLogGetDrugs completed').pipe(
          Effect.annotateLogs({ rpc: 'InjectionLogGetDrugs', count: result.length })
        )
        return result
      })
    )

    const InjectionLogGetSites = authedRpc('rpc.injection.getSites', (user) =>
      Effect.gen(function* () {
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

    const InjectionLogGetLastSite = authedRpc('rpc.injection.getLastSite', (user) =>
      Effect.gen(function* () {
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
      'rpc.injection.bulkAssignSchedule',
      (user, data: InjectionLogBulkAssignSchedule) =>
        Effect.gen(function* () {
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
      InjectionLogGetDrugs,
      InjectionLogGetSites,
      InjectionLogGetLastSite,
      InjectionLogBulkAssignSchedule,
    }
  })
)
