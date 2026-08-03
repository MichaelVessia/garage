import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, GoalRpcs } from '#shared'
import type { GoalId, UserGoalCreate, UserGoalUpdate } from '#shared'

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

        const result = yield* goalService.createGoal(user.id, data)
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

        const result = yield* goalService.updateGoal(user.id, data)
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
        const result = yield* goalService.getGoalProgress(user.id)
        yield* Effect.logDebug('GoalGetProgress completed').pipe(
          Effect.annotateLogs({
            rpc: 'GoalGetProgress',
            found: result.goal !== null,
            percentComplete: result.goal?.percentComplete ?? 'none',
            timezone: result.timezone,
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
