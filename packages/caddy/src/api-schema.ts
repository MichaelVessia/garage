import { Schema } from 'effect'

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

export const RoutesConfigSchema = Schema.Struct({
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

export const UpstreamSchema = Schema.Struct({
  address: NullableString,
  num_requests: NullableNumber,
  fails: NullableNumber,
  healthy: NullableBoolean,
})

export const PkiCaSchema = Schema.Struct({
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

const toRouteRecord = (route: JsonObject): RouteRecord => ({
  match: Array.isArray(route.match) ? route.match.filter(isJsonObject) : undefined,
  upstreams: collectUpstreams(route),
})

export const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

export const toRouteSummaries = (config: typeof RoutesConfigSchema.Type): ListResult<RouteSummary> => {
  const servers = config.apps?.http?.servers ?? {}
  const records = Object.entries(servers).map(([server, value]) => ({
    server,
    listen: fromNullable(value.listen),
    routes: (value.routes ?? []).map(toRouteRecord),
  }))
  return toListResult(records)
}

export const toUpstreamRecord = (upstream: typeof UpstreamSchema.Type): UpstreamRecord => ({
  address: fromNullable(upstream.address),
  numRequests: fromNullable(upstream.num_requests),
  fails: fromNullable(upstream.fails),
  healthy: fromNullable(upstream.healthy),
})

export const toPkiCa = (ca: typeof PkiCaSchema.Type): PkiCa => ({
  id: fromNullable(ca.id),
  name: fromNullable(ca.name),
  rootCommonName: fromNullable(ca.root_common_name),
  intermediateCommonName: fromNullable(ca.intermediate_common_name),
  rootCertificate: fromNullable(ca.root_certificate),
  intermediateCertificate: fromNullable(ca.intermediate_certificate),
})
