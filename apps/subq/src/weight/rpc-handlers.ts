import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, WeightRpcs } from '#shared'
import type { AuthUser, WeightLogCreate, WeightLogListParams, WeightLogUpdate } from '#shared'

import { WeightLogRepo } from './weight-log-repo.js'

export const WeightRpcHandlersLive = WeightRpcs.toLayer(
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo

    const WeightLogList = authedRpc(
      Effect.fn('rpc.weight.list')(function* (user: AuthUser, params: WeightLogListParams) {
        yield* Effect.logDebug('WeightLogList called').pipe(
          Effect.annotateLogs({
            rpc: 'WeightLogList',
            userId: user.id,
            startDate: params.startDate === undefined ? 'none' : DateTime.formatIso(params.startDate),
            endDate: params.endDate === undefined ? 'none' : DateTime.formatIso(params.endDate),
          })
        )
        const result = yield* repo.list(params, user.id)
        yield* Effect.logDebug('WeightLogList completed').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogList', count: result.length })
        )

        return result
      })
    )

    const WeightLogGet = authedRpc(
      Effect.fn('rpc.weight.get')(function* (user: AuthUser, { id }: { id: string }) {
        yield* Effect.logDebug('WeightLogGet called').pipe(Effect.annotateLogs({ rpc: 'WeightLogGet', id }))
        const result = yield* repo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('WeightLogGet completed').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogGet', id, found: result !== null })
        )

        return result
      })
    )

    const WeightLogCreate = authedRpc(
      Effect.fn('rpc.weight.create')(function* (user: AuthUser, data: WeightLogCreate) {
        yield* Effect.logInfo('WeightLogCreate called').pipe(
          Effect.annotateLogs({
            rpc: 'WeightLogCreate',
            userId: user.id,
            weight: data.weight,
          })
        )
        const weightLog = yield* repo.create(data, user.id)

        yield* Effect.logInfo('WeightLogCreate completed').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogCreate', id: weightLog.id })
        )

        return weightLog
      })
    )

    const WeightLogUpdate = authedRpc(
      Effect.fn('rpc.weight.update')(function* (user: AuthUser, data: WeightLogUpdate) {
        yield* Effect.logInfo('WeightLogUpdate called').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogUpdate', id: data.id })
        )
        const result = yield* repo.update(data, user.id)

        yield* Effect.logInfo('WeightLogUpdate completed').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogUpdate', id: result.id })
        )

        return result
      })
    )

    const WeightLogDelete = authedRpc(
      Effect.fn('rpc.weight.delete')(function* (user: AuthUser, { id }: { id: string }) {
        yield* Effect.logInfo('WeightLogDelete called').pipe(Effect.annotateLogs({ rpc: 'WeightLogDelete', id }))
        const result = yield* repo.delete(id, user.id)

        yield* Effect.logInfo('WeightLogDelete completed').pipe(
          Effect.annotateLogs({ rpc: 'WeightLogDelete', id, deleted: result })
        )

        return result
      })
    )

    return {
      WeightLogList,
      WeightLogGet,
      WeightLogCreate,
      WeightLogUpdate,
      WeightLogDelete,
    }
  })
)
