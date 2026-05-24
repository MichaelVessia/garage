import { Schema } from 'effect'

import type { ListResult, PeerRecord, StatusResult } from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

const PeerSchema = Schema.Struct({
  ID: NullableString,
  PublicKey: NullableString,
  HostName: NullableString,
  DNSName: NullableString,
  OS: NullableString,
  TailscaleIPs: NullableStringArray,
  Online: NullableBoolean,
  ExitNode: NullableBoolean,
  ExitNodeOption: NullableBoolean,
  Active: NullableBoolean,
  Relay: NullableString,
  LastSeen: NullableString,
  AllowedIPs: NullableStringArray,
  Tags: NullableStringArray,
})

const TailnetSchema = Schema.Struct({
  Name: NullableString,
  MagicDNSSuffix: NullableString,
  MagicDNSEnabled: NullableBoolean,
})

export const StatusJsonSchema = Schema.Struct({
  Version: NullableString,
  BackendState: NullableString,
  MagicDNSSuffix: NullableString,
  Health: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  CurrentTailnet: Schema.optional(Schema.NullOr(TailnetSchema)),
  Self: Schema.optional(Schema.NullOr(PeerSchema)),
  Peer: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, PeerSchema))),
})

export type StatusJson = typeof StatusJsonSchema.Type

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const firstString = (values: ReadonlyArray<string> | null | undefined): string | undefined => values?.[0]

const listResult = <Record>(records: ReadonlyArray<Record>, limit: number): ListResult<Record> => {
  const limited = records.slice(0, limit)
  return {
    count: limited.length,
    total: records.length,
    records: limited,
    moreAvailable: records.length > limited.length,
  }
}

const peerName = (peer: PeerRecord): string => peer.hostName ?? peer.dnsName ?? firstString(peer.ips) ?? ''

const sortPeers = (left: PeerRecord, right: PeerRecord): number => peerName(left).localeCompare(peerName(right))

export const toPeerRecord = (key: string | undefined, peer: typeof PeerSchema.Type): PeerRecord => ({
  id: fromNullable(peer.ID) ?? key,
  hostName: fromNullable(peer.HostName),
  dnsName: fromNullable(peer.DNSName),
  ips: peer.TailscaleIPs ?? [],
  os: fromNullable(peer.OS),
  online: fromNullable(peer.Online),
  active: fromNullable(peer.Active),
  exitNode: fromNullable(peer.ExitNode),
  exitNodeOption: fromNullable(peer.ExitNodeOption),
  relay: fromNullable(peer.Relay),
  lastSeen: fromNullable(peer.LastSeen),
  allowedIps: fromNullable(peer.AllowedIPs),
  tags: fromNullable(peer.Tags),
})

export const toPeers = (status: StatusJson): ReadonlyArray<PeerRecord> =>
  Object.entries(status.Peer ?? {})
    .map(([key, peer]) => toPeerRecord(key, peer))
    .sort(sortPeers)

export const toStatusResult = (status: StatusJson, limit: number): StatusResult => {
  const records = toPeers(status)
  const exitNodes = records.filter((peer) => peer.exitNodeOption === true)
  const currentExitNode = records.find((peer) => peer.exitNode === true)
  return {
    backendState: fromNullable(status.BackendState),
    version: fromNullable(status.Version),
    tailnetName: fromNullable(status.CurrentTailnet?.Name),
    magicDnsSuffix: fromNullable(status.CurrentTailnet?.MagicDNSSuffix) ?? fromNullable(status.MagicDNSSuffix),
    magicDnsEnabled: fromNullable(status.CurrentTailnet?.MagicDNSEnabled),
    self: status.Self === null || status.Self === undefined ? undefined : toPeerRecord(undefined, status.Self),
    peerCount: records.length,
    onlinePeerCount: records.filter((peer) => peer.online === true).length,
    exitNodeCount: exitNodes.length,
    currentExitNode,
    health: status.Health ?? [],
    peers: listResult(records, limit),
  }
}

export const toPeerList = (status: StatusJson, limit: number): ListResult<PeerRecord> =>
  listResult(toPeers(status), limit)

export const toExitNodeList = (status: StatusJson, limit: number): ListResult<PeerRecord> =>
  listResult(
    toPeers(status).filter((peer) => peer.exitNodeOption === true),
    limit
  )
