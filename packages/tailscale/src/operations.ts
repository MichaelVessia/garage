import * as Effect from 'effect/Effect'

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

export const status: (options?: LimitOptions) => Effect.Effect<StatusResult, TailscaleError, TailscaleApi> = Effect.fn(
  'tailscale.status'
)(
  function* (options?: LimitOptions): Effect.fn.Return<StatusResult, TailscaleError, TailscaleApi> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tailscale.limit': limitOptions.limit })
    const api = yield* TailscaleApi
    return yield* api.status(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tailscale', operation: 'status' })
)

export const peers: (options?: LimitOptions) => Effect.Effect<ListResult<PeerRecord>, TailscaleError, TailscaleApi> =
  Effect.fn('tailscale.peers')(
    function* (options?: LimitOptions): Effect.fn.Return<ListResult<PeerRecord>, TailscaleError, TailscaleApi> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'tailscale.limit': limitOptions.limit })
      const api = yield* TailscaleApi
      return yield* api.peers(limitOptions)
    },
    Effect.annotateLogs({ package: '@garage/tailscale', operation: 'peers' })
  )

export const exitNodes: (
  options?: LimitOptions
) => Effect.Effect<ListResult<PeerRecord>, TailscaleError, TailscaleApi> = Effect.fn('tailscale.exitNodes')(
  function* (options?: LimitOptions): Effect.fn.Return<ListResult<PeerRecord>, TailscaleError, TailscaleApi> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'tailscale.limit': limitOptions.limit })
    const api = yield* TailscaleApi
    return yield* api.exitNodes(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/tailscale', operation: 'exitNodes' })
)

export const currentExitNode: Effect.Effect<CurrentExitNodeResult, TailscaleError, TailscaleApi> = Effect.gen(
  function* () {
    const api = yield* TailscaleApi
    return yield* api.currentExitNode()
  }
).pipe(
  Effect.withSpan('tailscale.currentExitNode'),
  Effect.annotateLogs({ package: '@garage/tailscale', operation: 'currentExitNode' })
)

export const dns: Effect.Effect<DnsResult, TailscaleError, TailscaleApi> = Effect.gen(function* () {
  const api = yield* TailscaleApi
  return yield* api.dns()
}).pipe(Effect.withSpan('tailscale.dns'), Effect.annotateLogs({ package: '@garage/tailscale', operation: 'dns' }))

export const ip: Effect.Effect<IpResult, TailscaleError, TailscaleApi> = Effect.gen(function* () {
  const api = yield* TailscaleApi
  return yield* api.ip()
}).pipe(Effect.withSpan('tailscale.ip'), Effect.annotateLogs({ package: '@garage/tailscale', operation: 'ip' }))

export const whois = Effect.fn('tailscale.whois')(
  function* (options: WhoisOptions): Effect.fn.Return<JsonObject, TailscaleError, TailscaleApi> {
    yield* Effect.annotateCurrentSpan({ 'tailscale.target_length': options.target.length })
    const api = yield* TailscaleApi
    return yield* api.whois(options)
  },
  Effect.annotateLogs({ package: '@garage/tailscale', operation: 'whois' })
)

export const ping = Effect.fn('tailscale.ping')(
  function* (options: PingOptions): Effect.fn.Return<PingResult, TailscaleError, TailscaleApi> {
    yield* Effect.annotateCurrentSpan({ 'tailscale.target_length': options.target.length })
    const api = yield* TailscaleApi
    return yield* api.ping(options)
  },
  Effect.annotateLogs({ package: '@garage/tailscale', operation: 'ping' })
)
