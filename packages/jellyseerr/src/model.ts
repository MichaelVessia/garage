import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStatusValue = Schema.optional(Schema.Union([Schema.Number, Schema.String]))

export const JellyseerrConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type JellyseerrConfigValue = typeof JellyseerrConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  version: OptionalString,
  commitTag: OptionalString,
  updateAvailable: OptionalBoolean,
  commitsBehind: OptionalNumber,
  restartRequired: OptionalBoolean,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const RequestFilterSchema = Schema.Literals(['pending', 'all'])
export type RequestFilter = typeof RequestFilterSchema.Type

export const StatusValueSchema = Schema.Union([Schema.Number, Schema.String])
export type StatusValue = typeof StatusValueSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const RequestListOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  filter: RequestFilterSchema,
})
export type RequestListOptions = typeof RequestListOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const MediaSummarySchema = Schema.Struct({
  id: Schema.Number,
  tmdbId: OptionalNumber,
  mediaType: OptionalString,
  status: OptionalStatusValue,
  title: OptionalString,
  mediaAdded: OptionalString,
})
export type MediaSummary = typeof MediaSummarySchema.Type

export const RequestRecordSchema = Schema.Struct({
  id: Schema.Number,
  status: OptionalStatusValue,
  type: OptionalString,
  createdAt: OptionalString,
  updatedAt: OptionalString,
  requestedBy: OptionalString,
  media: MediaSummarySchema,
})
export type RequestRecord = typeof RequestRecordSchema.Type

export const RequestCountsSchema = Schema.Record(Schema.String, Schema.Number)
export type RequestCounts = typeof RequestCountsSchema.Type

export const SearchRecordSchema = Schema.Struct({
  id: Schema.Number,
  mediaType: OptionalString,
  title: OptionalString,
  releaseDate: OptionalString,
  firstAirDate: OptionalString,
  overview: OptionalString,
})
export type SearchRecord = typeof SearchRecordSchema.Type

export const UserRecordSchema = Schema.Struct({
  id: Schema.Number,
  email: OptionalString,
  displayName: OptionalString,
  username: OptionalString,
  userType: OptionalNumber,
  permissions: OptionalNumber,
})
export type UserRecord = typeof UserRecordSchema.Type

export const IssueRecordSchema = Schema.Struct({
  id: Schema.Number,
  issueType: OptionalString,
  status: OptionalStatusValue,
  createdAt: OptionalString,
  createdBy: OptionalString,
  media: MediaSummarySchema,
})
export type IssueRecord = typeof IssueRecordSchema.Type

export const DeleteRequestResultSchema = Schema.Struct({
  deleted: Schema.Boolean,
  requestId: Schema.Number,
  httpStatus: Schema.Number,
})
export type DeleteRequestResult = typeof DeleteRequestResultSchema.Type
