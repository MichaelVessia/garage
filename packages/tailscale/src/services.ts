import { Context } from 'effect'
import type { Effect } from 'effect'

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
  ProcessResult,
  StatusResult,
  WhoisOptions,
} from './model.js'

export interface TailscaleProcessService {
  readonly run: (args: ReadonlyArray<string>) => Effect.Effect<ProcessResult, TailscaleError>
}

export class TailscaleProcess extends Context.Service<TailscaleProcess, TailscaleProcessService>()(
  '@garage/tailscale/services/TailscaleProcess'
) {}

export class TailscaleApi extends Context.Service<
  TailscaleApi,
  {
    readonly status: (options: LimitOptions) => Effect.Effect<StatusResult, TailscaleError>
    readonly peers: (options: LimitOptions) => Effect.Effect<ListResult<PeerRecord>, TailscaleError>
    readonly exitNodes: (options: LimitOptions) => Effect.Effect<ListResult<PeerRecord>, TailscaleError>
    readonly currentExitNode: Effect.Effect<CurrentExitNodeResult, TailscaleError>
    readonly dns: Effect.Effect<DnsResult, TailscaleError>
    readonly ip: Effect.Effect<IpResult, TailscaleError>
    readonly whois: (options: WhoisOptions) => Effect.Effect<JsonObject, TailscaleError>
    readonly ping: (options: PingOptions) => Effect.Effect<PingResult, TailscaleError>
  }
>()('@garage/tailscale/services/TailscaleApi') {}
