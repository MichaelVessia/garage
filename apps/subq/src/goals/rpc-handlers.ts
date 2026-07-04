import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, GoalRpcs, NoWeightDataError, UserGoalUpdate, Weight } from '#shared'
import type { GoalId, UserGoalCreate } from '#shared'

import { GoalRepo } from './goal-repo.js'
import { GoalService } from './goal-service.js'

export const GoalRpcHandlersLive = GoalRpcs.toLayer(
  Effect.gen(function* () {
    const goalRepo = yield* GoalRepo
    const goalService = yield* GoalService

    const GoalGetActive = authedRpc('rpc.goal.getActive', (user) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GoalGetActive called').pipe(
          Effect.annotateLogs({ rpc: 'GoalGetActive', userId: user.id })
        )
        const result = yield* goalRepo.getActive(user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('GoalGetActive completed').pipe(
          Effect.annotateLogs({
            rpc: 'GoalGetActive',
            found: result !== null,
            goalId: result?.id ?? 'none',
          })
        )
        return result
      })
    )

    const GoalGet = authedRpc('rpc.goal.get', (user, { id }: { id: GoalId }) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GoalGet called').pipe(Effect.annotateLogs({ rpc: 'GoalGet', id }))
        const result = yield* goalRepo.findById(id, user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('GoalGet completed').pipe(
          Effect.annotateLogs({ rpc: 'GoalGet', id, found: result !== null })
        )
        return result
      })
    )

    const GoalList = authedRpc('rpc.goal.list', (user) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GoalList called').pipe(Effect.annotateLogs({ rpc: 'GoalList', userId: user.id }))
        const result = yield* goalRepo.list(user.id)
        yield* Effect.logDebug('GoalList completed').pipe(
          Effect.annotateLogs({ rpc: 'GoalList', count: result.length })
        )
        return result
      })
    )

    const GoalCreate = authedRpc('rpc.goal.create', (user, data: UserGoalCreate) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('GoalCreate called').pipe(
          Effect.annotateLogs({
            rpc: 'GoalCreate',
            userId: user.id,
            goalWeight: data.goalWeight,
          })
        )

        // Get starting weight - use provided, or lookup at startingDate, or fetch most recent
        let startingWeight: number
        if (data.startingWeight !== undefined) {
          ;({ startingWeight } = data)
        } else if (Option.isSome(data.startingDate)) {
          const weightOpt = yield* goalService.getWeightAtDate(user.id, data.startingDate.value)
          if (Option.isNone(weightOpt)) {
            return yield* Effect.fail(NoWeightDataError.make({}))
          }
          startingWeight = weightOpt.value
        } else {
          const weightOpt = yield* goalService.getMostRecentWeight(user.id)
          if (Option.isNone(weightOpt)) {
            return yield* Effect.fail(NoWeightDataError.make({}))
          }
          startingWeight = weightOpt.value
        }

        const result = yield* goalRepo.create(data, startingWeight, user.id)
        yield* Effect.logInfo('GoalCreate completed').pipe(
          Effect.annotateLogs({
            rpc: 'GoalCreate',
            id: result.id,
            goalWeight: result.goalWeight,
          })
        )
        return result
      })
    )

    const GoalUpdate = authedRpc('rpc.goal.update', (user, data: UserGoalUpdate) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('GoalUpdate called').pipe(
          Effect.annotateLogs({
            rpc: 'GoalUpdate',
            id: data.id,
            isActive: data.isActive,
          })
        )

        // If startingDate changed and no explicit startingWeight, lookup weight at new date
        let updateData = data
        if (data.startingDate !== undefined && data.startingWeight === undefined) {
          const weightOpt = yield* goalService.getWeightAtDate(user.id, data.startingDate)
          if (Option.isSome(weightOpt)) {
            updateData = new UserGoalUpdate({
              id: data.id,
              ...(data.goalWeight === undefined ? {} : { goalWeight: data.goalWeight }),
              startingWeight: Weight.make(weightOpt.value),
              ...(data.startingDate === undefined ? {} : { startingDate: data.startingDate }),
              ...(data.targetDate === undefined ? {} : { targetDate: data.targetDate }),
              ...(data.notes === undefined ? {} : { notes: data.notes }),
              ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
            })
          }
        }

        const result = yield* goalRepo.update(updateData, user.id)
        yield* Effect.logInfo('GoalUpdate completed').pipe(Effect.annotateLogs({ rpc: 'GoalUpdate', id: data.id }))
        return result
      })
    )

    const GoalDelete = authedRpc('rpc.goal.delete', (user, { id }: { id: GoalId }) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('GoalDelete called').pipe(Effect.annotateLogs({ rpc: 'GoalDelete', id }))
        const result = yield* goalRepo.delete(id, user.id)
        yield* Effect.logInfo('GoalDelete completed').pipe(
          Effect.annotateLogs({ rpc: 'GoalDelete', id, deleted: result })
        )
        return result
      })
    )

    const GoalGetProgress = authedRpc('rpc.goal.getProgress', (user) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('GoalGetProgress called').pipe(
          Effect.annotateLogs({ rpc: 'GoalGetProgress', userId: user.id })
        )
        const result = yield* goalService.getGoalProgress(user.id).pipe(Effect.map(Option.getOrNull))
        yield* Effect.logDebug('GoalGetProgress completed').pipe(
          Effect.annotateLogs({
            rpc: 'GoalGetProgress',
            found: result !== null,
            percentComplete: result?.percentComplete ?? 'none',
          })
        )
        return result
      })
    )

    return {
      GoalGetActive,
      GoalGet,
      GoalList,
      GoalCreate,
      GoalUpdate,
      GoalDelete,
      GoalGetProgress,
    }
  })
)
