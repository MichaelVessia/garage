import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

export const CaddyConfigValue = Schema.Struct({ url: Schema.String })
export type CaddyConfigValue = typeof CaddyConfigValue.Type

export const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObject.Type

export const RouteRecord = Schema.Struct({
  match: Schema.Array(JsonObject).pipe(Schema.optional),
  upstreams: Schema.Array(Schema.String),
})
export type RouteRecord = typeof RouteRecord.Type

export const RouteSummary = Schema.Struct({
  server: Schema.String,
  listen: OptionalStringArray,
  routes: Schema.Array(RouteRecord),
})
export type RouteSummary = typeof RouteSummary.Type

export const UpstreamRecord = Schema.Struct({
  address: OptionalString,
  numRequests: OptionalNumber,
  fails: OptionalNumber,
  healthy: OptionalBoolean,
})
export type UpstreamRecord = typeof UpstreamRecord.Type

export const PkiCa = Schema.Struct({
  id: OptionalString,
  name: OptionalString,
  rootCommonName: OptionalString,
  intermediateCommonName: OptionalString,
  rootCertificate: OptionalString,
  intermediateCertificate: OptionalString,
})
export type PkiCa = typeof PkiCa.Type

export const ReloadResult = Schema.Struct({
  reloaded: Schema.Boolean,
  httpStatus: Schema.Number,
})
export type ReloadResult = typeof ReloadResult.Type

export const ListResult = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>
