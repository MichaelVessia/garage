import { createRuntimeFromSave, exportSave, generate } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const saveKey = 'beltworks:save:v3'
type Store = Pick<Storage, 'getItem' | 'setItem'>

const localRecord = S.Struct({ save: S.Unknown, revision: S.Finite })
const json = S.fromJsonString(S.Unknown)
export const loadBoard = (storage: () => Store) => (runtime: Runtime) => {
  try {
    const raw = storage().getItem(saveKey)
    if (raw !== null) {
      const parsed = S.decodeResult(json)(raw)
      if (Result.isSuccess(parsed)) {
        const record = S.decodeUnknownResult(localRecord)(parsed.success)
        const loaded = createRuntimeFromSave(Result.isSuccess(record) ? record.success.save : parsed.success)
        if (loaded.ok && runtime.restore(exportSave(loaded.value)).ok) {
          return Result.isSuccess(record) ? record.success.revision : 0
        }
      }
    }
  } catch {
    // The browser can disable storage or contain an interrupted save.
  }
  runtime.tick(generate(0))
  return undefined
}
export const saveBoard =
  (storage: () => Store) =>
  (runtime: Runtime, revision = Math.floor(performance.timeOrigin + performance.now())) => {
    try {
      const encoded = S.encodeResult(json)({ save: exportSave(runtime), revision })
      if (Result.isFailure(encoded)) {
        return false
      }
      storage().setItem(saveKey, encoded.success)
      return true
    } catch {
      return false
    }
  }
