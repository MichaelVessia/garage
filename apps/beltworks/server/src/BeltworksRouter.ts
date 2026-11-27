import { createRuntimeFromSave, exportSave } from '@garage/beltworks-domain'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import { catchUp } from './catchUp.ts'

export class FactoryStore extends Context.Service<
  FactoryStore,
  {
    readonly get: (key: string) => Effect.Effect<unknown>
    readonly put: (key: string, record: string) => Effect.Effect<void>
  }
>()('@garage/beltworks-server/BeltworksRouter/FactoryStore') {}

const recordSchema = S.Struct({ save: S.Unknown, savedAtMs: S.Finite, revision: S.String })
const missing = Response.empty({ status: 404 })
const invalid = Response.empty({ status: 400 })
const json = S.encodeEffect(S.fromJsonString(S.Unknown))
export const router = Effect.gen(function* () {
  const request = yield* Request.HttpServerRequest
  const path = new URL(request.url, 'https://beltworks.local').pathname
  if (path === '/health' && request.method === 'GET') {
    return Response.jsonUnsafe({ status: 'ok' })
  }
  const match = /^\/api\/(saves|shares)(?:\/([^/]+))?$/u.exec(path)
  if (match === null) {
    return missing
  }
  const [, collection, id] = match
  const sharing = collection === 'shares'
  const create = sharing && id === undefined && request.method === 'POST'
  if (!create && (id === undefined || !/^[a-zA-Z0-9-]{8,64}$/u.test(id))) {
    return invalid
  }
  const store = yield* FactoryStore
  const now = yield* Clock.currentTimeMillis
  if (create || (!sharing && request.method === 'PUT')) {
    const input = yield* request.json.pipe(Effect.option)
    const restored = input.pipe(Option.getOrUndefined, createRuntimeFromSave)
    if (!restored.ok) {
      return invalid
    }
    const random = yield* SecureRandom.SecureRandom
    const key = id ?? (yield* random.uuidV4())
    const revision = request.headers['x-factory-revision'] ?? String(now)
    const encoded = yield* json({ save: exportSave(restored.value), savedAtMs: now, revision }).pipe(Effect.orDie)
    yield* store.put(collection + '/' + key, encoded)
    return Response.jsonUnsafe(create ? { shareId: key } : { ok: true, savedAtMs: now })
  }
  if (request.method !== 'GET') {
    return missing
  }
  const key = collection + '/' + id
  const stored = yield* store.get(key)
  if (stored === null || stored === undefined) {
    return missing
  }
  const record = yield* S.decodeUnknownEffect(recordSchema)(stored).pipe(Effect.orDie)
  if (sharing) {
    return Response.jsonUnsafe({ save: record.save })
  }
  const restored = createRuntimeFromSave(record.save)
  if (!restored.ok) {
    return Response.empty({ status: 500 })
  }
  const elapsed = now - record.savedAtMs
  const progress = catchUp({ runtime: restored.value, elapsedMs: elapsed >= 5000 ? elapsed : 0 })
  if (progress.offlineTicks > 0) {
    const encoded = yield* json({ ...record, save: progress.save, savedAtMs: now }).pipe(Effect.orDie)
    yield* store.put(key, encoded)
  }
  return Response.jsonUnsafe({ ...progress, revision: record.revision, savedAtMs: record.savedAtMs })
})
