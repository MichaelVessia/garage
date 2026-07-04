import { JsonObject as BaseJsonObject, ListResultSchema as BaseListResultSchema } from '@garage/cli-protocol'
import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const JsonObject = BaseJsonObject
export type JsonObject = typeof JsonObject.Type

export const ProcessResult = Schema.Struct({
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
})
export type ProcessResult = typeof ProcessResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const WhoisOptions = Schema.Struct({ target: Schema.String })
export type WhoisOptions = typeof WhoisOptions.Type

export const PingOptions = Schema.Struct({ target: Schema.String })
export type PingOptions = typeof PingOptions.Type

export const ListResult = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    ...BaseListResultSchema(record).fields,
    total: OptionalNumber,
    moreAvailable: OptionalBoolean,
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>

export const PeerRecord = Schema.Struct({
  id: OptionalString,
  hostName: OptionalString,
  dnsName: OptionalString,
  ips: Schema.Array(Schema.String),
  os: OptionalString,
  online: OptionalBoolean,
  active: OptionalBoolean,
  exitNode: OptionalBoolean,
  exitNodeOption: OptionalBoolean,
  relay: OptionalString,
  lastSeen: OptionalString,
  allowedIps: OptionalStringArray,
  tags: OptionalStringArray,
})
export type PeerRecord = typeof PeerRecord.Type

export const StatusResult = Schema.Struct({
  backendState: OptionalString,
  version: OptionalString,
  tailnetName: OptionalString,
  magicDnsSuffix: OptionalString,
  magicDnsEnabled: OptionalBoolean,
  self: Schema.optional(PeerRecord),
  peerCount: Schema.Number,
  onlinePeerCount: Schema.Number,
  exitNodeCount: Schema.Number,
  currentExitNode: Schema.optional(PeerRecord),
  health: Schema.Array(Schema.String),
  peers: ListResult(PeerRecord),
})
export type StatusResult = typeof StatusResult.Type

export const CurrentExitNodeResult = Schema.Struct({
  usingExitNode: Schema.Boolean,
  peer: Schema.optional(PeerRecord),
})
export type CurrentExitNodeResult = typeof CurrentExitNodeResult.Type

export const DnsResult = Schema.Struct({
  output: Schema.String,
  lines: Schema.Array(Schema.String),
})
export type DnsResult = typeof DnsResult.Type

export const IpResult = Schema.Struct({
  ipv4: OptionalString,
  ipv6: OptionalString,
})
export type IpResult = typeof IpResult.Type

export const PingResult = Schema.Struct({
  target: Schema.String,
  output: Schema.String,
  lines: Schema.Array(Schema.String),
})
export type PingResult = typeof PingResult.Type
