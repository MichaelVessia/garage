export { ExitNodeListSchema, PeerListSchema, StatusJsonSchema } from './api-schema.js'
export {
  TailscaleCliMissingError,
  TailscaleCommandFailedError,
  TailscaleDecodeError,
  TailscaleError,
  TailscaleNotRunningError,
  cliMissing,
  commandFailed,
  decodeError,
  notRunning,
} from './errors.js'
export type { TailscaleErrorCode } from './errors.js'
export {
  CurrentExitNodeResultSchema,
  DnsResultSchema,
  IpResultSchema,
  JsonObjectSchema,
  LimitOptionsSchema,
  ListResultSchema,
  PeerRecordSchema,
  PingOptionsSchema,
  PingResultSchema,
  ProcessResultSchema,
  StatusResultSchema,
  WhoisOptionsSchema,
} from './model.js'
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
