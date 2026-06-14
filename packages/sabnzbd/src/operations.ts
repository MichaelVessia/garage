import * as Effect from 'effect/Effect'

import type { SabnzbdError } from './errors.js'
import type {
  ActionResult,
  DeleteOptions,
  HistoryResult,
  LimitOptions,
  QueueResult,
  ServerStats,
  SystemStatus,
  VersionResult,
} from './model.js'
import { SabnzbdApi } from './services.js'
import type { SabnzbdConfig } from './services.js'

export const defaultLimit = 10
export const defaultHistoryLimit = 50

const defaultLimitOptions: LimitOptions = { limit: defaultLimit }
const defaultHistoryOptions: LimitOptions = { limit: defaultHistoryLimit }

export const status: Effect.Effect<SystemStatus, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const api = yield* SabnzbdApi
  return yield* api.status()
}).pipe(Effect.withSpan('sabnzbd.status'), Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'status' }))

export const version: Effect.Effect<VersionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const api = yield* SabnzbdApi
  return yield* api.version()
}).pipe(Effect.withSpan('sabnzbd.version'), Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'version' }))

export const queue: (options?: LimitOptions) => Effect.Effect<QueueResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> =
  Effect.fn('sabnzbd.queue')(
    function* (options?: LimitOptions): Effect.fn.Return<QueueResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'sabnzbd.limit': limitOptions.limit })
      const api = yield* SabnzbdApi
      return yield* api.queue(limitOptions)
    },
    Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'queue' })
  )

export const history: (
  options?: LimitOptions
) => Effect.Effect<HistoryResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.fn('sabnzbd.history')(
  function* (options?: LimitOptions): Effect.fn.Return<HistoryResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> {
    const limitOptions = options ?? defaultHistoryOptions
    yield* Effect.annotateCurrentSpan({ 'sabnzbd.limit': limitOptions.limit })
    const api = yield* SabnzbdApi
    return yield* api.history(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'history' })
)

export const pause: Effect.Effect<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const api = yield* SabnzbdApi
  return yield* api.pause()
}).pipe(Effect.withSpan('sabnzbd.pause'), Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'pause' }))

export const resume: Effect.Effect<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const api = yield* SabnzbdApi
  return yield* api.resume()
}).pipe(Effect.withSpan('sabnzbd.resume'), Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'resume' }))

export const deleteQueueItem = Effect.fn('sabnzbd.deleteQueueItem')(
  function* (
    nzoId: string,
    options: DeleteOptions
  ): Effect.fn.Return<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> {
    yield* Effect.annotateCurrentSpan({ 'sabnzbd.nzo_id': nzoId, 'sabnzbd.delete_files': options.deleteFiles })
    const api = yield* SabnzbdApi
    return yield* api.delete(nzoId, options)
  },
  Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'deleteQueueItem' })
)

export const serverStats: Effect.Effect<ServerStats, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(
  function* () {
    const api = yield* SabnzbdApi
    return yield* api.serverStats()
  }
).pipe(
  Effect.withSpan('sabnzbd.serverStats'),
  Effect.annotateLogs({ package: '@garage/sabnzbd', operation: 'serverStats' })
)
