import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as S from 'effect/Schema'

const client = ManagedRuntime.make(FetchHttpClient.layer)
const versionInfo = S.Struct({ version: S.String })

export function watchUpdates({
  currentVersion,
  onUpdate,
}: {
  currentVersion: string
  onUpdate: (version: string) => void
}) {
  if (currentVersion === 'dev') {
    return
  }
  let lastCheck = -Infinity
  let checking = false
  const read = Effect.gen(function* () {
    const response = yield* HttpClient.get(new URL('/version.json', location.origin))
    if (response.status === 200) {
      const { version } = yield* response.json.pipe(Effect.flatMap(S.decodeUnknownEffect(versionInfo)))
      if (version !== 'dev' && version !== currentVersion) {
        window.clearInterval(interval)
        document.removeEventListener('visibilitychange', check)
        onUpdate(version)
      }
    }
  }).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { cache: 'no-store' }),
    Effect.timeout(Duration.seconds(15)),
    Effect.tapError((error) => Effect.logDebug(error)),
    Effect.ignore
  )
  function check() {
    const now = performance.now()
    if (document.visibilityState !== 'visible' || checking || now - lastCheck < 15_000) {
      return
    }
    checking = true
    lastCheck = now
    void client.runPromise(read).finally(() => {
      checking = false
    })
  }
  const interval = window.setInterval(check, 60_000)
  document.addEventListener('visibilitychange', check)
}

export function saveAndReload({ save, reload }: { save: () => Promise<void> | void; reload: () => void }) {
  return client.runPromise(
    Effect.tryPromise({ try: () => Promise.resolve(save()), catch: () => 'Upload unavailable' }).pipe(
      Effect.timeout(Duration.millis(1500)),
      Effect.tapError((error) => Effect.logDebug(error)),
      Effect.ignore,
      Effect.tap(() => Effect.sync(reload))
    )
  )
}
