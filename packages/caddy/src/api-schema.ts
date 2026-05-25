import { Schema, SchemaGetter } from 'effect'

import {
  ListResultSchema as DomainListResultSchema,
  PkiCaSchema as DomainPkiCaSchema,
  RouteSummarySchema as DomainRouteSummarySchema,
  UpstreamRecordSchema as DomainUpstreamRecordSchema,
} from './model.js'
import type { JsonObject, ListResult, PkiCa, RouteRecord, RouteSummary, UpstreamRecord } from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

const ServerSchema = Schema.Struct({
  listen: NullableStringArray,
  routes: Schema.optional(Schema.NullOr(Schema.Array(JsonObjectSchema))),
})

const RoutesConfigApiSchema = Schema.Struct({
  apps: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        http: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              servers: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, ServerSchema))),
            })
          )
        ),
      })
    )
  ),
})

const UpstreamApiSchema = Schema.Struct({
  address: NullableString,
  num_requests: NullableNumber,
  fails: NullableNumber,
  healthy: NullableBoolean,
})

const PkiCaApiSchema = Schema.Struct({
  id: NullableString,
  name: NullableString,
  root_common_name: NullableString,
  intermediate_common_name: NullableString,
  root_certificate: NullableString,
  intermediate_certificate: NullableString,
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
          isJsonObject(upstream) && typeof upstream.dial === 'string' ? [upstream.dial] : []
        )
      : []

  return [...direct, ...Object.values(value).flatMap(collectUpstreams)]
}

const routeRecordFromApi = (route: JsonObject): RouteRecord => ({
  match: Array.isArray(route.match) ? route.match.filter(isJsonObject) : undefined,
  upstreams: collectUpstreams(route),
})

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

const routeSummariesFromApi = (config: typeof RoutesConfigApiSchema.Type): ListResult<RouteSummary> => {
  const servers = config.apps?.http?.servers ?? {}
  const records = Object.entries(servers).map(([server, value]) => ({
    server,
    listen: fromNullable(value.listen),
    routes: (value.routes ?? []).map(routeRecordFromApi),
  }))
  return listResult(records)
}

const routeSummariesToApi = (result: ListResult<RouteSummary>): typeof RoutesConfigApiSchema.Type => ({
  apps: {
    http: {
      servers: Object.fromEntries(
        result.records.map((record) => [record.server, { listen: record.listen, routes: record.routes }])
      ),
    },
  },
})

export const RoutesConfigSchema = RoutesConfigApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainRouteSummarySchema), {
    decode: SchemaGetter.transform(routeSummariesFromApi),
    encode: SchemaGetter.transform(routeSummariesToApi),
  })
)

const upstreamRecordFromApi = (upstream: typeof UpstreamApiSchema.Type): UpstreamRecord => ({
  address: fromNullable(upstream.address),
  numRequests: fromNullable(upstream.num_requests),
  fails: fromNullable(upstream.fails),
  healthy: fromNullable(upstream.healthy),
})

const upstreamRecordToApi = (upstream: UpstreamRecord): typeof UpstreamApiSchema.Type => ({
  address: upstream.address,
  num_requests: upstream.numRequests,
  fails: upstream.fails,
  healthy: upstream.healthy,
})

export const UpstreamSchema = UpstreamApiSchema.pipe(
  Schema.decodeTo(DomainUpstreamRecordSchema, {
    decode: SchemaGetter.transform(upstreamRecordFromApi),
    encode: SchemaGetter.transform(upstreamRecordToApi),
  })
)

const pkiCaFromApi = (ca: typeof PkiCaApiSchema.Type): PkiCa => ({
  id: fromNullable(ca.id),
  name: fromNullable(ca.name),
  rootCommonName: fromNullable(ca.root_common_name),
  intermediateCommonName: fromNullable(ca.intermediate_common_name),
  rootCertificate: fromNullable(ca.root_certificate),
  intermediateCertificate: fromNullable(ca.intermediate_certificate),
})

const pkiCaToApi = (ca: PkiCa): typeof PkiCaApiSchema.Type => ({
  id: ca.id,
  name: ca.name,
  root_common_name: ca.rootCommonName,
  intermediate_common_name: ca.intermediateCommonName,
  root_certificate: ca.rootCertificate,
  intermediate_certificate: ca.intermediateCertificate,
})

export const PkiCaSchema = PkiCaApiSchema.pipe(
  Schema.decodeTo(DomainPkiCaSchema, {
    decode: SchemaGetter.transform(pkiCaFromApi),
    encode: SchemaGetter.transform(pkiCaToApi),
  })
)
