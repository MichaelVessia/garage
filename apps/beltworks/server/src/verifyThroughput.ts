import {
  createRuntimeFromSave,
  exportSave,
  Game,
  ItemDelivered,
  landmarks,
  leaderboardEligible,
  Progression,
  simulation,
} from '@garage/beltworks-domain'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import type { PlayerEntry } from './LeaderboardStore.ts'

type VerifiedFactory = {
  snapshot: ReturnType<typeof exportSave>
  score: Pick<PlayerEntry, 'ascensions' | 'totalCores' | 'milestone' | 'medals' | 'bestRunTicks' | 'verifiedThroughput'>
}

const progression = Game.Inspector(
  'Beltworks/LeaderboardProgress',
  {
    resources: { progress: Game.System.readResource(Progression) },
  },
  ({ resources }) => resources.progress.get()
)

export function verifyFactoryThroughput(save: unknown): Result.Result<VerifiedFactory, 'invalid' | 'ineligible'> {
  const restored = createRuntimeFromSave(save)
  if (!restored.ok) {
    return Result.fail('invalid')
  }

  const runtime = restored.value
  const progress = runtime.inspect(progression)
  if (!leaderboardEligible({ milestoneIndex: progress.milestoneIndex, ascensions: progress.meta.ascensions })) {
    return Result.fail('ineligible')
  }
  const snapshot = exportSave(runtime)
  let deliveries = 0
  const observe = Game.Schedule(
    Game.System(
      'Beltworks/VerifyDeliveries',
      {
        events: { delivery: Game.System.readEvent(ItemDelivered) },
      },
      ({ events }) => {
        for (const delivery of events.delivery.all()) {
          if (delivery.matchedTarget || landmarks.includes(delivery.value)) {
            deliveries++
          }
        }
      }
    )
  )
  for (let i = 0; i < 600; i++) {
    if (!runtime.tick(simulation, observe).ok) {
      return Result.fail('invalid')
    }
  }
  return Result.succeed({
    snapshot,
    score: {
      ascensions: progress.meta.ascensions,
      totalCores: progress.meta.totalCoresEarned,
      milestone: progress.milestoneIndex + 1,
      medals: progress.meta.medals.length,
      bestRunTicks: Option.flatMapNullishOr(progress.meta.bestRunTicks, (value) => value),
      verifiedThroughput: deliveries * 6,
    },
  })
}
