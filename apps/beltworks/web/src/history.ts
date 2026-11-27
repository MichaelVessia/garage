import type { exportSave } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'

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
      if (previous === undefined || !runtime.restore(previous).ok) {
        return false
      }
      snapshots.pop()
      return true
    },
    clear() {
      snapshots.length = 0
    },
  }
}
