import type { exportSave } from '@garage/beltworks-domain'
import { Game, Progression } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'

const ownedMedals = Game.Inspector(
  'Beltworks/OwnedMedals',
  { resources: { p: Game.System.readResource(Progression) } },
  ({ resources }) => resources.p.get().meta.medals
)
export function editHistory(runtime: Runtime) {
  const snapshots: Array<ReturnType<typeof exportSave>> = []
  return {
    get available() {
      return snapshots.length > 0
    },
    record(snapshot: ReturnType<typeof exportSave>) {
      snapshots.push(snapshot)
      if (snapshots.length > 25) {
        snapshots.shift()
      }
    },
    undo() {
      const previous = snapshots.at(-1)
      if (previous === undefined) {
        return false
      }
      const medals = runtime.inspect(ownedMedals)
      if (!runtime.restore(previous).ok) {
        return false
      }
      if (medals.length !== runtime.inspect(ownedMedals).length) {
        runtime.tick(
          Game.Schedule(
            Game.System(
              'Beltworks/RetainMedals',
              { resources: { progress: Game.System.writeResource(Progression) } },
              ({ resources }) => {
                const p = resources.progress.get()
                resources.progress.set({ ...p, meta: { ...p.meta, medals } })
              }
            )
          )
        )
      }
      snapshots.pop()
      return true
    },
    clear() {
      snapshots.length = 0
    },
  }
}
