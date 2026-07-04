import { makeConfigReaders } from '@garage/cli-protocol'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { envMissing } from './errors.js'
import type { SabnzbdError } from './errors.js'
import type {
  ActionResult,
  DeleteOptions,
  HistoryResult,
  LimitOptions,
  QueueResult,
  SabnzbdConfigValue,
  ServerStats,
  SystemStatus,
  VersionResult,
} from './model.js'

export class SabnzbdConfig extends Context.Service<
  SabnzbdConfig,
  {
    readonly get: () => Effect.Effect<SabnzbdConfigValue, SabnzbdError>
  }
>()('@garage/sabnzbd/services/SabnzbdConfig') {}

export class SabnzbdApi extends Context.Service<
  SabnzbdApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, SabnzbdError>
    readonly version: () => Effect.Effect<VersionResult, SabnzbdError>
    readonly queue: (options: LimitOptions) => Effect.Effect<QueueResult, SabnzbdError>
    readonly history: (options: LimitOptions) => Effect.Effect<HistoryResult, SabnzbdError>
    readonly pause: () => Effect.Effect<ActionResult, SabnzbdError>
    readonly resume: () => Effect.Effect<ActionResult, SabnzbdError>
    readonly delete: (nzoId: string, options: DeleteOptions) => Effect.Effect<ActionResult, SabnzbdError>
    readonly serverStats: () => Effect.Effect<ServerStats, SabnzbdError>
  }
>()('@garage/sabnzbd/services/SabnzbdApi') {}

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

const loadConfig = Effect.fn('SabnzbdConfig.get')(
  function* () {
    const url = yield* readRequiredString('SABNZBD_URL')
    const apiKey = yield* readRequiredSecret('SABNZBD_API_KEY')

    return { url, apiKey }
  },
  Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdConfig', method: 'get' })
)

export const SabnzbdConfigLive = Layer.effect(
  SabnzbdConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(loadConfig())
    return SabnzbdConfig.of({ get: () => cachedGet })
  })
)
