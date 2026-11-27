import { createRuntimeFromSave, exportSave } from '@garage/beltworks-domain'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { catchUp } from './catchUp.ts'
import { LeaderboardStore } from './LeaderboardStore.ts'
import { verifyFactoryThroughput } from './verifyThroughput.ts'

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
const playerIdPattern = /^[a-zA-Z0-9-]{8,64}$/u
const submission = S.Struct({
  playerId: S.String.check(S.isPattern(playerIdPattern)),
  callsign: S.Trim.check(S.isPattern(/^[a-zA-Z0-9 _.-]{1,16}$/u)),
  save: S.Unknown,
  shareFactory: S.optionalKey(S.Boolean),
})

const putShare = Effect.fn(function* (save: unknown, now: number) {
  const store = yield* FactoryStore
  const random = yield* SecureRandom.SecureRandom
  const shareId = yield* random.uuidV4()
  const encoded = yield* json({ save, savedAtMs: now, revision: String(now) }).pipe(Effect.orDie)
  yield* store.put('shares/' + shareId, encoded)
  return shareId
})

const leaderboardRoute = Effect.fn(function* (request: Request.HttpServerRequest, url: URL) {
  const store = yield* LeaderboardStore
  if (request.method === 'GET') {
    const viewer = url.searchParams.get('playerId')
    if (viewer !== null && !playerIdPattern.test(viewer)) {
      return invalid
    }
    const boards = yield* store.list(viewer ?? '')
    return Response.jsonUnsafe(boards)
  }
  if (request.method !== 'POST') {
    return missing
  }
  const input = yield* request.json.pipe(Effect.flatMap(S.decodeUnknownEffect(submission)), Effect.option)
  if (Option.isNone(input)) {
    return invalid
  }
  const { playerId, callsign, save, shareFactory } = input.value
  const verified = verifyFactoryThroughput(save)
  if (Result.isFailure(verified)) {
    return verified.failure === 'ineligible'
      ? Response.jsonUnsafe({ error: 'Complete Milestone 2 to join the global leaderboard' }, { status: 400 })
      : invalid
  }
  const updatedAtMs = yield* Clock.currentTimeMillis
  const shareId =
    shareFactory === true
      ? yield* putShare(verified.success.snapshot, updatedAtMs).pipe(Effect.asSome)
      : Option.none<string>()
  const result = yield* store.submit(
    { playerId, callsign, ...verified.success.score, shareId, updatedAtMs },
    shareFactory === false
  )
  return Response.jsonUnsafe(result)
})

export const router = Effect.gen(function* () {
  const request = yield* Request.HttpServerRequest
  const url = new URL(request.url, 'https://beltworks.local')
  const path = url.pathname
  if (path === '/api/leaderboard') {
    return yield* leaderboardRoute(request, url)
  }
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
  if (!create && (id === undefined || !playerIdPattern.test(id))) {
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
    const save = exportSave(restored.value)
    if (create) {
      return Response.jsonUnsafe({ shareId: yield* putShare(save, now) })
    }
    const revision = request.headers['x-factory-revision'] ?? String(now)
    const encoded = yield* json({ save, savedAtMs: now, revision }).pipe(Effect.orDie)
    yield* store.put(collection + '/' + id, encoded)
    return Response.jsonUnsafe({ ok: true, savedAtMs: now })
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
