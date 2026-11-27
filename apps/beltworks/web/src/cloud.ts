import { createRuntimeFromSave, exportSave } from '@garage/beltworks-domain'
import type { Runtime } from '@garage/beltworks-domain'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as Request from 'effect/http/HttpClientRequest'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as S from 'effect/Schema'

const client = ManagedRuntime.make(FetchHttpClient.layer)
const playerKey = 'beltworks:player-id:v4'
function playerId() {
  try {
    const existing = localStorage.getItem(playerKey)
    if (existing !== null && /^[a-zA-Z0-9-]{8,64}$/u.test(existing)) {
      return { id: existing, fresh: false }
    }
    const id = SecureRandom.uuidV4Unsafe()
    localStorage.setItem(playerKey, id)
    return { id, fresh: true }
  } catch {
    return undefined
  }
}
const snapshot = S.Struct({
  save: S.Unknown,
  revision: S.optional(S.String),
  sparksEarned: S.optional(S.Finite),
  offlineTicks: S.optional(S.Int),
})
const share = S.Struct({ shareId: S.String })

export function cloud(runtime: Runtime) {
  const player = playerId()
  const path = new URL('/api/saves/' + player?.id, location.origin)
  function upload(revision: number, keepalive: boolean) {
    if (player !== undefined) {
      const put = Request.put(path, { headers: { 'x-factory-revision': String(revision) } }).pipe(
        Request.bodyJsonUnsafe(exportSave(runtime)),
        HttpClient.execute
      )
      client.runFork(put.pipe(Effect.provideService(FetchHttpClient.RequestInit, { keepalive })))
    }
  }
  const load = Effect.fn('beltworks.load')(function* (canRestore: () => boolean, localRevision?: number) {
    const url = new URL(location.href)
    const factory = url.searchParams.get('factory')
    if ((player === undefined || player.fresh) && factory === null) {
      return
    }
    const target = factory === null ? path : new URL('/api/shares/' + encodeURIComponent(factory), url)
    const response = yield* HttpClient.get(target).pipe(Effect.timeout(Duration.seconds(4)))
    if (response.status !== 200) {
      return
    }
    const data = yield* response.json.pipe(Effect.flatMap(S.decodeUnknownEffect(snapshot)))
    if (!canRestore()) {
      return
    }
    const revision = Number(data.revision)
    if (
      factory === null &&
      localRevision !== undefined &&
      !(revision > localRevision || (revision === localRevision && (data.offlineTicks ?? 0) > 0))
    ) {
      return
    }
    const restored = createRuntimeFromSave(data.save)
    if (!restored.ok || !runtime.restore(exportSave(restored.value)).ok) {
      return
    }
    if (factory !== null) {
      url.searchParams.delete('factory')
      history.replaceState(null, '', url)
      return 'Loaded shared factory'
    }
    return (data.sparksEarned ?? 0) > 0 ? 'Welcome back · +' + data.sparksEarned + ' Sparks earned while away' : ''
  })
  const shareLink = Effect.gen(function* () {
    const response = yield* Request.post(new URL('/api/shares', location.origin)).pipe(
      Request.bodyJsonUnsafe(exportSave(runtime)),
      HttpClient.execute
    )
    if (response.status !== 200) {
      return 'Could not share factory'
    }
    const result = yield* response.json.pipe(Effect.flatMap(S.decodeUnknownEffect(share)))
    const url = new URL('/', location.origin)
    url.searchParams.set('factory', result.shareId)
    return yield* Effect.tryPromise({ try: () => navigator.clipboard.writeText(url.href), catch: () => url.href }).pipe(
      Effect.match({
        onSuccess: () => 'Share link copied!',
        onFailure: () => url.href,
      })
    )
  })
  return {
    upload,
    load: (canRestore: () => boolean, revision?: number) => client.runPromise(load(canRestore, revision)),
    shareLink: () => client.runPromise(shareLink),
  }
}
