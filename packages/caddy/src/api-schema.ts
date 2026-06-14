import * as P from 'effect/Predicate'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  ListResult as DomainListResult,
  PkiCa as DomainPkiCa,
  RouteSummary as DomainRouteSummary,
  UpstreamRecord as DomainUpstreamRecord,
} from './model.js'
import type { JsonObject, ListResult, PkiCa, RouteRecord, RouteSummary, UpstreamRecord } from './model.js'

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const NullableNumber = Schema.Number.pipe(Schema.NullOr, Schema.optional)
const NullableBoolean = Schema.Boolean.pipe(Schema.NullOr, Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)

export const JsonObjectApi = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObjectApi = typeof JsonObjectApi.Type

const Server = Schema.Struct({
  listen: NullableStringArray,
  routes: Schema.Array(JsonObjectApi).pipe(Schema.NullOr, Schema.optional),
})

const RoutesConfigApi = Schema.Struct({
  apps: Schema.Struct({
    http: Schema.Struct({
      servers: Schema.Record(Schema.String, Server).pipe(Schema.NullOr, Schema.optional),
    }).pipe(Schema.NullOr, Schema.optional),
  }).pipe(Schema.NullOr, Schema.optional),
})
type RoutesConfigApi = typeof RoutesConfigApi.Type

const UpstreamApi = Schema.Struct({
  address: NullableString,
  num_requests: NullableNumber,
  fails: NullableNumber,
  healthy: NullableBoolean,
})
type UpstreamApi = typeof UpstreamApi.Type

const PkiCaApi = Schema.Struct({
  id: NullableString,
  name: NullableString,
  root_common_name: NullableString,
  intermediate_common_name: NullableString,
  root_certificate: NullableString,
  intermediate_certificate: NullableString,
})
type PkiCaApi = typeof PkiCaApi.Type

const isJsonObject = (value: unknown): value is JsonObject =>
  P.isObject(value) && value !== null && !Array.isArray(value)

const collectUpstreams = (value: unknown): ReadonlyArray<string> => {
  if (Array.isArray(value)) {
    return value.flatMap(collectUpstreams)
  }

  if (!isJsonObject(value)) {
    return []
  }

  const direct =
    value.handler === 'reverse_proxy' && Array.isArray(value.upstreams)
      ? value.upstreams.flatMap((upstream) =>
          isJsonObject(upstream) && P.isString(upstream.dial) ? [upstream.dial] : []
        )
      : []

  return [...direct, ...R.values(value).flatMap(collectUpstreams)]
}

const routeRecordFromApi = (route: JsonObject): RouteRecord => ({
  match: Array.isArray(route.match) ? route.match.filter(isJsonObject) : undefined,
  upstreams: collectUpstreams(route),
})

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

const routeSummariesFromApi = (config: RoutesConfigApi): ListResult<RouteSummary> => {
  const servers = config.apps?.http?.servers ?? {}
  const records = R.toEntries(servers).map(([server, value]) => ({
    server,
    listen: value.listen ?? undefined,
    routes: (value.routes ?? []).map(routeRecordFromApi),
  }))
  return listResult(records)
}

const routeSummariesToApi = (result: ListResult<RouteSummary>): RoutesConfigApi => ({
  apps: {
    http: {
      servers: R.fromEntries(
        result.records.map((record) => [record.server, { listen: record.listen, routes: record.routes }])
      ),
    },
  },
})

export const RoutesConfig = RoutesConfigApi.pipe(
  Schema.decodeTo(DomainListResult(DomainRouteSummary), {
    decode: SchemaGetter.transform(routeSummariesFromApi),
    encode: SchemaGetter.transform(routeSummariesToApi),
  })
)

const upstreamRecordFromApi = (upstream: UpstreamApi): UpstreamRecord => ({
  address: upstream.address ?? undefined,
  numRequests: upstream.num_requests ?? undefined,
  fails: upstream.fails ?? undefined,
  healthy: upstream.healthy ?? undefined,
})

const upstreamRecordToApi = (upstream: UpstreamRecord): UpstreamApi => ({
  address: upstream.address,
  num_requests: upstream.numRequests,
  fails: upstream.fails,
  healthy: upstream.healthy,
})

export const Upstream = UpstreamApi.pipe(
  Schema.decodeTo(DomainUpstreamRecord, {
    decode: SchemaGetter.transform(upstreamRecordFromApi),
    encode: SchemaGetter.transform(upstreamRecordToApi),
  })
)

const pkiCaFromApi = (ca: PkiCaApi): PkiCa => ({
  id: ca.id ?? undefined,
  name: ca.name ?? undefined,
  rootCommonName: ca.root_common_name ?? undefined,
  intermediateCommonName: ca.intermediate_common_name ?? undefined,
  rootCertificate: ca.root_certificate ?? undefined,
  intermediateCertificate: ca.intermediate_certificate ?? undefined,
})

const pkiCaToApi = (ca: PkiCa): PkiCaApi => ({
  id: ca.id,
  name: ca.name,
  root_common_name: ca.rootCommonName,
  intermediate_common_name: ca.intermediateCommonName,
  root_certificate: ca.rootCertificate,
  intermediate_certificate: ca.intermediateCertificate,
})

export const PkiCaWire = PkiCaApi.pipe(
  Schema.decodeTo(DomainPkiCa, {
    decode: SchemaGetter.transform(pkiCaFromApi),
    encode: SchemaGetter.transform(pkiCaToApi),
  })
)
