import { createRuntimeFromSave, exportSave } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'

export function factoryInspection(runtime: Runtime) {
  let home = Option.none<ReturnType<typeof exportSave>>()
  return {
    get visiting() {
      return Option.isSome(home)
    },
    saveHome<A>(write: (owner: Runtime) => A) {
      if (Option.isNone(home)) {
        return write(runtime)
      }
      return undefined
    },
    getSave: () => Option.getOrElse(home, () => exportSave(runtime)),
    enter(save: unknown) {
      const factory = createRuntimeFromSave(save)
      if (!factory.ok) {
        throw new Error('Invalid shared factory')
      }
      const original = Option.getOrElse(home, () => exportSave(runtime))
      if (!runtime.restore(exportSave(factory.value)).ok) {
        throw new Error('Could not open shared factory')
      }
      home = Option.some(original)
    },
    leave() {
      if (Option.isSome(home) && !runtime.restore(home.value).ok) {
        throw new Error('Could not restore your factory')
      }
      home = Option.none()
    },
  }
}
