import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObjectSchema.Type

export const ProcessResultSchema = Schema.Struct({
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
})
export type ProcessResult = typeof ProcessResultSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const WhoisOptionsSchema = Schema.Struct({ target: Schema.String })
export type WhoisOptions = typeof WhoisOptionsSchema.Type

export const PingOptionsSchema = Schema.Struct({ target: Schema.String })
export type PingOptions = typeof PingOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    total: OptionalNumber,
    records: Schema.Array(record),
    moreAvailable: OptionalBoolean,
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const PeerRecordSchema = Schema.Struct({
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
export type PeerRecord = typeof PeerRecordSchema.Type

export const StatusResultSchema = Schema.Struct({
  backendState: OptionalString,
  version: OptionalString,
  tailnetName: OptionalString,
  magicDnsSuffix: OptionalString,
  magicDnsEnabled: OptionalBoolean,
  self: Schema.optional(PeerRecordSchema),
  peerCount: Schema.Number,
  onlinePeerCount: Schema.Number,
  exitNodeCount: Schema.Number,
  currentExitNode: Schema.optional(PeerRecordSchema),
  health: Schema.Array(Schema.String),
  peers: ListResultSchema(PeerRecordSchema),
})
export type StatusResult = typeof StatusResultSchema.Type

export const CurrentExitNodeResultSchema = Schema.Struct({
  usingExitNode: Schema.Boolean,
  peer: Schema.optional(PeerRecordSchema),
})
export type CurrentExitNodeResult = typeof CurrentExitNodeResultSchema.Type

export const DnsResultSchema = Schema.Struct({
  output: Schema.String,
  lines: Schema.Array(Schema.String),
})
export type DnsResult = typeof DnsResultSchema.Type

export const IpResultSchema = Schema.Struct({
  ipv4: OptionalString,
  ipv6: OptionalString,
})
export type IpResult = typeof IpResultSchema.Type

export const PingResultSchema = Schema.Struct({
  target: Schema.String,
  output: Schema.String,
  lines: Schema.Array(Schema.String),
})
export type PingResult = typeof PingResultSchema.Type
