import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const CaddyConfigValueSchema = Schema.Struct({ url: Schema.String })
export type CaddyConfigValue = typeof CaddyConfigValueSchema.Type

export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)
export type JsonObject = typeof JsonObjectSchema.Type

export const RouteRecordSchema = Schema.Struct({
  match: Schema.optional(Schema.Array(JsonObjectSchema)),
  upstreams: Schema.Array(Schema.String),
})
export type RouteRecord = typeof RouteRecordSchema.Type

export const RouteSummarySchema = Schema.Struct({
  server: Schema.String,
  listen: OptionalStringArray,
  routes: Schema.Array(RouteRecordSchema),
})
export type RouteSummary = typeof RouteSummarySchema.Type

export const UpstreamRecordSchema = Schema.Struct({
  address: OptionalString,
  numRequests: OptionalNumber,
  fails: OptionalNumber,
  healthy: OptionalBoolean,
})
export type UpstreamRecord = typeof UpstreamRecordSchema.Type

export const PkiCaSchema = Schema.Struct({
  id: OptionalString,
  name: OptionalString,
  rootCommonName: OptionalString,
  intermediateCommonName: OptionalString,
  rootCertificate: OptionalString,
  intermediateCertificate: OptionalString,
})
export type PkiCa = typeof PkiCaSchema.Type

export const ReloadResultSchema = Schema.Struct({
  reloaded: Schema.Boolean,
  httpStatus: Schema.Number,
})
export type ReloadResult = typeof ReloadResultSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>
