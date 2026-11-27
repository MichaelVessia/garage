import { createRuntimeFromSave, exportSave, generate } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const saveKey = 'beltworks:save:v3'
type Store = Pick<Storage, 'getItem' | 'setItem'>

const json = S.fromJsonString(S.Unknown)
export const loadBoard = (storage: () => Store) => (runtime: Runtime) => {
  try {
    const raw = storage().getItem(saveKey)
    if (raw !== null) {
      const parsed = S.decodeResult(json)(raw)
      if (Result.isSuccess(parsed)) {
        const loaded = createRuntimeFromSave(parsed.success)
        if (loaded.ok && runtime.restore(exportSave(loaded.value)).ok) {
          return
        }
      }
    }
  } catch {
    // The browser can disable storage or contain an interrupted save.
  }
  runtime.tick(generate(0))
}
export const saveBoard = (storage: () => Store) => (runtime: Runtime) => {
  try {
    const encoded = S.encodeResult(json)(exportSave(runtime))
    if (Result.isFailure(encoded)) {
      return false
    }
    storage().setItem(saveKey, encoded.success)
    return true
  } catch {
    return false
  }
}
