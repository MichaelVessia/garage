import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type * as Order from 'effect/Order'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  ListResult as DomainListResult,
  PeerRecord as DomainPeerRecord,
  StatusResult as DomainStatusResult,
} from './model.js'
import type { ListResult, PeerRecord, StatusResult as StatusResultType } from './model.js'

const NullableString = Schema.NullOr(Schema.String).pipe(Schema.optional)
const NullableBoolean = Schema.NullOr(Schema.Boolean).pipe(Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObject.Type

const PeerApi = Schema.Struct({
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

const Tailnet = Schema.Struct({
  Name: NullableString,
  MagicDNSSuffix: NullableString,
  MagicDNSEnabled: NullableBoolean,
})

export const StatusJson = Schema.Struct({
  Version: NullableString,
  BackendState: NullableString,
  MagicDNSSuffix: NullableString,
  Health: Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional),
  CurrentTailnet: Schema.NullOr(Tailnet).pipe(Schema.optional),
  Self: Schema.NullOr(PeerApi).pipe(Schema.optional),
  Peer: Schema.NullOr(Schema.Record(Schema.String, PeerApi)).pipe(Schema.optional),
})

export type StatusJson = typeof StatusJson.Type

const toUndefined = <A>(value: A) => Option.getOrUndefined(Option.fromNullishOr(value))

const firstString = (values: ReadonlyArray<string>): Option.Option<string> => Arr.head(values)

const listResult = <Record>(records: ReadonlyArray<Record>, limit: number): ListResult<Record> => {
  const limited = records.slice(0, limit)
  return {
    count: limited.length,
    total: records.length,
    records: limited,
    moreAvailable: records.length > limited.length,
  }
}

const peerName = (peer: PeerRecord): string =>
  Option.getOrElse(
    Option.orElse(
      Option.orElse(Option.fromNullishOr(peer.hostName), () => Option.fromNullishOr(peer.dnsName)),
      () => firstString(peer.ips)
    ),
    () => ''
  )

const byPeerName: Order.Order<PeerRecord> = (left, right) => {
  const compared = peerName(left).localeCompare(peerName(right))
  if (compared < 0) {
    return -1
  }
  return compared > 0 ? 1 : 0
}

const peerRecordFromApi = (key: Option.Option<string>, peer: typeof PeerApi.Type): PeerRecord => ({
  id: toUndefined(peer.ID) ?? Option.getOrUndefined(key),
  hostName: toUndefined(peer.HostName),
  dnsName: toUndefined(peer.DNSName),
  ips: peer.TailscaleIPs ?? [],
  os: toUndefined(peer.OS),
  online: toUndefined(peer.Online),
  active: toUndefined(peer.Active),
  exitNode: toUndefined(peer.ExitNode),
  exitNodeOption: toUndefined(peer.ExitNodeOption),
  relay: toUndefined(peer.Relay),
  lastSeen: toUndefined(peer.LastSeen),
  allowedIps: toUndefined(peer.AllowedIPs),
  tags: toUndefined(peer.Tags),
})

const peerRecordToApi = (peer: PeerRecord): typeof PeerApi.Type => ({
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
  Arr.sort(
    Arr.map(R.toEntries(status.Peer ?? {}), ([key, peer]) => peerRecordFromApi(Option.some(key), peer)),
    byPeerName
  )

const statusResultFromApi =
  (limit: number) =>
  (status: StatusJson): StatusResultType => {
    const records = peersFromApi(status)
    const exitNodes = records.filter((peer) => peer.exitNodeOption === true)
    const currentExitNode = records.find((peer) => peer.exitNode === true)
    return {
      backendState: toUndefined(status.BackendState),
      version: toUndefined(status.Version),
      tailnetName: toUndefined(status.CurrentTailnet?.Name),
      magicDnsSuffix: toUndefined(status.CurrentTailnet?.MagicDNSSuffix) ?? toUndefined(status.MagicDNSSuffix),
      magicDnsEnabled: toUndefined(status.CurrentTailnet?.MagicDNSEnabled),
      self: Option.getOrUndefined(
        Option.map(Option.fromNullishOr(status.Self), (self) => peerRecordFromApi(Option.none(), self))
      ),
      peerCount: records.length,
      onlinePeerCount: records.filter((peer) => peer.online === true).length,
      exitNodeCount: exitNodes.length,
      currentExitNode,
      health: status.Health ?? [],
      peers: listResult(records, limit),
    }
  }

const peerEntry = (peer: PeerRecord): readonly [string, typeof PeerApi.Type] => [
  peer.id ?? peerName(peer),
  peerRecordToApi(peer),
]

const statusResultToApi = (status: StatusResultType): StatusJson => ({
  Version: status.version,
  BackendState: status.backendState,
  MagicDNSSuffix: status.magicDnsSuffix,
  Health: status.health,
  CurrentTailnet: {
    Name: status.tailnetName,
    MagicDNSSuffix: status.magicDnsSuffix,
    MagicDNSEnabled: status.magicDnsEnabled,
  },
  Self: Option.getOrUndefined(Option.map(Option.fromNullishOr(status.self), peerRecordToApi)),
  Peer: R.fromEntries(Arr.map(status.peers.records, peerEntry)),
})

export const StatusResult = (limit: number) =>
  StatusJson.pipe(
    Schema.decodeTo(DomainStatusResult, {
      decode: SchemaGetter.transform(statusResultFromApi(limit)),
      encode: SchemaGetter.transform(statusResultToApi),
    })
  )

const peerListFromApi =
  (limit: number) =>
  (status: StatusJson): ListResult<PeerRecord> =>
    listResult(peersFromApi(status), limit)

const peerListToApi = (result: ListResult<PeerRecord>): StatusJson => ({
  Peer: R.fromEntries(Arr.map(result.records, peerEntry)),
})

export const PeerList = (limit: number) =>
  StatusJson.pipe(
    Schema.decodeTo(DomainListResult(DomainPeerRecord), {
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

export const ExitNodeList = (limit: number) =>
  StatusJson.pipe(
    Schema.decodeTo(DomainListResult(DomainPeerRecord), {
      decode: SchemaGetter.transform(exitNodeListFromApi(limit)),
      encode: SchemaGetter.transform(peerListToApi),
    })
  )
