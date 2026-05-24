import { Effect } from 'effect'

import type { TailscaleError } from './errors.js'
import type {
  CurrentExitNodeResult,
  DnsResult,
  IpResult,
  JsonObject,
  LimitOptions,
  ListResult,
  PeerRecord,
  PingOptions,
  PingResult,
  StatusResult,
  WhoisOptions,
} from './model.js'
import { TailscaleApi } from './services.js'

export const defaultLimit = 25
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<StatusResult, TailscaleError, TailscaleApi> =>
  Effect.gen(function* () {
    const api = yield* TailscaleApi
    return yield* api.status(options)
  })

export const peers = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<PeerRecord>, TailscaleError, TailscaleApi> =>
  Effect.gen(function* () {
    const api = yield* TailscaleApi
    return yield* api.peers(options)
  })

export const exitNodes = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<PeerRecord>, TailscaleError, TailscaleApi> =>
  Effect.gen(function* () {
    const api = yield* TailscaleApi
    return yield* api.exitNodes(options)
  })

export const currentExitNode: Effect.Effect<CurrentExitNodeResult, TailscaleError, TailscaleApi> = Effect.gen(
  function* () {
    const api = yield* TailscaleApi
    return yield* api.currentExitNode
  }
)

export const dns: Effect.Effect<DnsResult, TailscaleError, TailscaleApi> = Effect.gen(function* () {
  const api = yield* TailscaleApi
  return yield* api.dns
})

export const ip: Effect.Effect<IpResult, TailscaleError, TailscaleApi> = Effect.gen(function* () {
  const api = yield* TailscaleApi
  return yield* api.ip
})

export const whois = (options: WhoisOptions): Effect.Effect<JsonObject, TailscaleError, TailscaleApi> =>
  Effect.gen(function* () {
    const api = yield* TailscaleApi
    return yield* api.whois(options)
  })

export const ping = (options: PingOptions): Effect.Effect<PingResult, TailscaleError, TailscaleApi> =>
  Effect.gen(function* () {
    const api = yield* TailscaleApi
    return yield* api.ping(options)
  })
