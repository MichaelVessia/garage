export { JsonObjectSchema, StatusJsonSchema, toExitNodeList, toPeerList, toStatusResult } from './api-schema.js'
export { cliMissing, commandFailed, decodeError, notRunning } from './errors.js'
export type { TailscaleErrorCode } from './errors.js'
export { TailscaleError } from './errors.js'
export type {
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
export { TailscaleApiLive } from './process.js'
export { currentExitNode, defaultLimit, dns, exitNodes, ip, peers, ping, status, whois } from './operations.js'
export { TailscaleApi, TailscaleProcess } from './services.js'
export type { TailscaleProcessService } from './services.js'
