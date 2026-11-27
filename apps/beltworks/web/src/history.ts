import type { exportSave } from '@garage/beltworks-domain'
import { Game, Progression } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'

const runProgress = Game.Inspector(
  'Beltworks/RunProgress',
  { resources: { p: Game.System.readResource(Progression) } },
  ({ resources }) => resources.p.get()
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
      const {
        runTicks,
        meta: { medals, bestRunTicks },
      } = runtime.inspect(runProgress)
      if (!runtime.restore(previous).ok) {
        return false
      }

      runtime.tick(
        Game.Schedule(
          Game.System(
            'Beltworks/RetainRunProgress',
            { resources: { progress: Game.System.writeResource(Progression) } },
            ({ resources }) => {
              const p = resources.progress.get()
              resources.progress.set({ ...p, runTicks, meta: { ...p.meta, medals, bestRunTicks } })
            }
          )
        )
      )
      snapshots.pop()
      return true
    },
    clear() {
      snapshots.length = 0
    },
  }
}
