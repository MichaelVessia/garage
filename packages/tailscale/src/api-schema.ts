import { Schema, SchemaGetter } from 'effect'

import {
  ListResultSchema as DomainListResultSchema,
  PeerRecordSchema as DomainPeerRecordSchema,
  StatusResultSchema as DomainStatusResultSchema,
} from './model.js'
import type { ListResult, PeerRecord, StatusResult } from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

const PeerApiSchema = Schema.Struct({
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
  Self: Schema.optional(Schema.NullOr(PeerApiSchema)),
  Peer: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, PeerApiSchema))),
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

const peerRecordFromApi = (key: string | undefined, peer: typeof PeerApiSchema.Type): PeerRecord => ({
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

const peerRecordToApi = (peer: PeerRecord): typeof PeerApiSchema.Type => ({
  ID: peer.id,
  HostName: peer.hostName,
  DNSName: peer.dnsName,
  TailscaleIPs: peer.ips,
  OS: peer.os,
  Online: peer.online,
  Active: peer.active,
  ExitNode: peer.exitNode,
  ExitNodeOption: peer.exitNodeOption,
  Relay: peer.relay,
  LastSeen: peer.lastSeen,
  AllowedIPs: peer.allowedIps,
  Tags: peer.tags,
})

const peersFromApi = (status: StatusJson): ReadonlyArray<PeerRecord> =>
  Object.entries(status.Peer ?? {})
    .map(([key, peer]) => peerRecordFromApi(key, peer))
    .sort(sortPeers)

const statusResultFromApi =
  (limit: number) =>
  (status: StatusJson): StatusResult => {
    const records = peersFromApi(status)
    const exitNodes = records.filter((peer) => peer.exitNodeOption === true)
    const currentExitNode = records.find((peer) => peer.exitNode === true)
    return {
      backendState: fromNullable(status.BackendState),
      version: fromNullable(status.Version),
      tailnetName: fromNullable(status.CurrentTailnet?.Name),
      magicDnsSuffix: fromNullable(status.CurrentTailnet?.MagicDNSSuffix) ?? fromNullable(status.MagicDNSSuffix),
      magicDnsEnabled: fromNullable(status.CurrentTailnet?.MagicDNSEnabled),
      self: status.Self === null || status.Self === undefined ? undefined : peerRecordFromApi(undefined, status.Self),
      peerCount: records.length,
      onlinePeerCount: records.filter((peer) => peer.online === true).length,
      exitNodeCount: exitNodes.length,
      currentExitNode,
      health: status.Health ?? [],
      peers: listResult(records, limit),
    }
  }

const statusResultToApi = (status: StatusResult): StatusJson => ({
  Version: status.version,
  BackendState: status.backendState,
  MagicDNSSuffix: status.magicDnsSuffix,
  Health: status.health,
  CurrentTailnet: {
    Name: status.tailnetName,
    MagicDNSSuffix: status.magicDnsSuffix,
    MagicDNSEnabled: status.magicDnsEnabled,
  },
  Self: status.self === undefined ? undefined : peerRecordToApi(status.self),
  Peer: Object.fromEntries(status.peers.records.map((peer) => [peer.id ?? peerName(peer), peerRecordToApi(peer)])),
})

export const StatusResultSchema = (limit: number) =>
  StatusJsonSchema.pipe(
    Schema.decodeTo(DomainStatusResultSchema, {
      decode: SchemaGetter.transform(statusResultFromApi(limit)),
      encode: SchemaGetter.transform(statusResultToApi),
    })
  )

const peerListFromApi =
  (limit: number) =>
  (status: StatusJson): ListResult<PeerRecord> =>
    listResult(peersFromApi(status), limit)

const peerListToApi = (result: ListResult<PeerRecord>): StatusJson => ({
  Peer: Object.fromEntries(result.records.map((peer) => [peer.id ?? peerName(peer), peerRecordToApi(peer)])),
})

export const PeerListSchema = (limit: number) =>
  StatusJsonSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainPeerRecordSchema), {
      decode: SchemaGetter.transform(peerListFromApi(limit)),
      encode: SchemaGetter.transform(peerListToApi),
    })
  )

const exitNodeListFromApi =
  (limit: number) =>
  (status: StatusJson): ListResult<PeerRecord> =>
    listResult(
      peersFromApi(status).filter((peer) => peer.exitNodeOption === true),
      limit
    )

export const ExitNodeListSchema = (limit: number) =>
  StatusJsonSchema.pipe(
    Schema.decodeTo(DomainListResultSchema(DomainPeerRecordSchema), {
      decode: SchemaGetter.transform(exitNodeListFromApi(limit)),
      encode: SchemaGetter.transform(peerListToApi),
    })
  )
