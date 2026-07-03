import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStatusValue = Schema.optional(Schema.Union([Schema.Number, Schema.String]))

export const JellyseerrConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type JellyseerrConfigValue = typeof JellyseerrConfigValue.Type

export const SystemStatus = Schema.Struct({
  version: OptionalString,
  commitTag: OptionalString,
  updateAvailable: OptionalBoolean,
  commitsBehind: OptionalNumber,
  restartRequired: OptionalBoolean,
})
export type SystemStatus = typeof SystemStatus.Type

export const RequestFilter = Schema.Literals(['pending', 'all'])
export type RequestFilter = typeof RequestFilter.Type

export const StatusValue = Schema.Union([Schema.Number, Schema.String])
export type StatusValue = typeof StatusValue.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const RequestListOptions = Schema.Struct({
  limit: Schema.Number,
  filter: RequestFilter,
})
export type RequestListOptions = typeof RequestListOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    totalRecords: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const MediaSummary = Schema.Struct({
  id: Schema.Number,
  tmdbId: OptionalNumber,
  mediaType: OptionalString,
  status: OptionalStatusValue,
  title: OptionalString,
  mediaAdded: OptionalString,
})
export type MediaSummary = typeof MediaSummary.Type

export const RequestRecord = Schema.Struct({
  id: Schema.Number,
  status: OptionalStatusValue,
  type: OptionalString,
  createdAt: OptionalString,
  updatedAt: OptionalString,
  requestedBy: OptionalString,
  media: MediaSummary,
})
export type RequestRecord = typeof RequestRecord.Type

export const RequestCounts = Schema.Record(Schema.String, Schema.Number)
export type RequestCounts = typeof RequestCounts.Type

export const SearchRecord = Schema.Struct({
  id: Schema.Number,
  mediaType: OptionalString,
  title: OptionalString,
  releaseDate: OptionalString,
  firstAirDate: OptionalString,
  overview: OptionalString,
})
export type SearchRecord = typeof SearchRecord.Type

export const UserRecord = Schema.Struct({
  id: Schema.Number,
  email: OptionalString,
  displayName: OptionalString,
  username: OptionalString,
  userType: OptionalNumber,
  permissions: OptionalNumber,
})
export type UserRecord = typeof UserRecord.Type

export const IssueRecord = Schema.Struct({
  id: Schema.Number,
  issueType: OptionalString,
  status: OptionalStatusValue,
  createdAt: OptionalString,
  createdBy: OptionalString,
  media: MediaSummary,
})
export type IssueRecord = typeof IssueRecord.Type

export const DeleteRequestResult = Schema.Struct({
  deleted: Schema.Boolean,
  requestId: Schema.Number,
  httpStatus: Schema.Number,
})
export type DeleteRequestResult = typeof DeleteRequestResult.Type
