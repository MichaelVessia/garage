import { Building, Game, Progression, exportSave, simulation } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'

const summary = Game.Inspector(
  'Beltworks/OfflineProduction',
  {
    resources: { progression: Game.System.readResource(Progression) },
    queries: { buildings: Game.Query({ selection: { building: Game.Query.read(Building) } }) },
  },
  ({ resources, queries }) => ({
    progress: resources.progression.get(),
    active: Arr.some(queries.buildings.each(), (entity) => queries.buildings.data.building.get(entity).kind !== 'hub'),
  })
)

type OfflineProgress = {
  save: ReturnType<typeof exportSave>
  offlineTicks: number
  sparksEarned: number
  deliveredDelta: number
}

export function catchUp({ runtime, elapsedMs }: { runtime: Runtime; elapsedMs: number }): OfflineProgress {
  const before = runtime.inspect(summary)
  const offlineTicks = before.active ? Math.min(3600, Math.max(0, Math.floor((elapsedMs / 1000) * 60))) : 0
  for (let i = 0; i < offlineTicks; i++) {
    runtime.tick(simulation)
  }
  const after = runtime.inspect(summary).progress
  return {
    save: exportSave(runtime),
    offlineTicks,
    sparksEarned: after.sparks - before.progress.sparks,
    deliveredDelta: after.totalDelivered - before.progress.totalDelivered,
  }
}
