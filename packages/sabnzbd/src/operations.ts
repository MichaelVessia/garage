import { Effect } from 'effect'

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
import { SabnzbdApi, SabnzbdConfig } from './services.js'

export const defaultLimit = 10
export const defaultHistoryLimit = 50

const defaultLimitOptions: LimitOptions = { limit: defaultLimit }
const defaultHistoryOptions: LimitOptions = { limit: defaultHistoryLimit }

export const status: Effect.Effect<SystemStatus, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const config = yield* SabnzbdConfig
  yield* config.get
  const api = yield* SabnzbdApi
  return yield* api.status
})

export const version: Effect.Effect<VersionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const config = yield* SabnzbdConfig
  yield* config.get
  const api = yield* SabnzbdApi
  return yield* api.version
})

export const queue = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<QueueResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> =>
  Effect.gen(function* () {
    const config = yield* SabnzbdConfig
    yield* config.get
    const api = yield* SabnzbdApi
    return yield* api.queue(options)
  })

export const history = (
  options: LimitOptions = defaultHistoryOptions
): Effect.Effect<HistoryResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> =>
  Effect.gen(function* () {
    const config = yield* SabnzbdConfig
    yield* config.get
    const api = yield* SabnzbdApi
    return yield* api.history(options)
  })

export const pause: Effect.Effect<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const config = yield* SabnzbdConfig
  yield* config.get
  const api = yield* SabnzbdApi
  return yield* api.pause
})

export const resume: Effect.Effect<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(function* () {
  const config = yield* SabnzbdConfig
  yield* config.get
  const api = yield* SabnzbdApi
  return yield* api.resume
})

export const deleteQueueItem = (
  nzoId: string,
  options: DeleteOptions
): Effect.Effect<ActionResult, SabnzbdError, SabnzbdApi | SabnzbdConfig> =>
  Effect.gen(function* () {
    const config = yield* SabnzbdConfig
    yield* config.get
    const api = yield* SabnzbdApi
    return yield* api.delete(nzoId, options)
  })

export const serverStats: Effect.Effect<ServerStats, SabnzbdError, SabnzbdApi | SabnzbdConfig> = Effect.gen(
  function* () {
    const config = yield* SabnzbdConfig
    yield* config.get
    const api = yield* SabnzbdApi
    return yield* api.serverStats
  }
)
