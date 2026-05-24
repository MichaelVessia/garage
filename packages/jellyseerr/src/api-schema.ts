import { Schema } from 'effect'

import type {
  IssueRecord,
  ListResult,
  MediaSummary,
  RequestCounts,
  RequestRecord,
  SearchRecord,
  StatusValue,
  SystemStatus,
  UserRecord,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const StatusValueSchema = Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String])))

export const StatusSchema = Schema.Struct({
  version: NullableString,
  commitTag: NullableString,
  updateAvailable: NullableBoolean,
  commitsBehind: NullableNumber,
  restartRequired: NullableBoolean,
})

const UserSummarySchema = Schema.Struct({
  displayName: NullableString,
  username: NullableString,
})

export const MediaSchema = Schema.Struct({
  id: Schema.Number,
  tmdbId: NullableNumber,
  mediaType: NullableString,
  status: StatusValueSchema,
  title: NullableString,
  name: NullableString,
  mediaAdded: NullableString,
})

export const RequestSchema = Schema.Struct({
  id: Schema.Number,
  status: StatusValueSchema,
  type: NullableString,
  createdAt: NullableString,
  updatedAt: NullableString,
  requestedBy: Schema.optional(Schema.NullOr(UserSummarySchema)),
  media: MediaSchema,
})

export const RequestsResponseSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(RequestSchema),
})

export const RequestCountsSchema = Schema.Record(Schema.String, Schema.Number)

export const SearchRecordSchema = Schema.Struct({
  id: Schema.Number,
  mediaType: NullableString,
  title: NullableString,
  name: NullableString,
  releaseDate: NullableString,
  firstAirDate: NullableString,
  overview: NullableString,
})

export const SearchResponseSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(SearchRecordSchema),
})

export const MediaResponseSchema = MediaSchema

export const MediaListResponseSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(MediaSchema),
})

export const UserRecordSchema = Schema.Struct({
  id: Schema.Number,
  email: NullableString,
  displayName: NullableString,
  jellyfinUsername: NullableString,
  plexUsername: NullableString,
  username: NullableString,
  userType: NullableNumber,
  permissions: NullableNumber,
})

export const UserListResponseSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(UserRecordSchema),
})

export const IssueRecordSchema = Schema.Struct({
  id: Schema.Number,
  issueType: NullableString,
  status: StatusValueSchema,
  createdAt: NullableString,
  createdBy: Schema.optional(Schema.NullOr(UserSummarySchema)),
  media: MediaSchema,
})

export const IssueListResponseSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(IssueRecordSchema),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const titleFrom = (title: string | null | undefined, name: string | null | undefined): string | undefined =>
  fromNullable(title) ?? fromNullable(name)

const requesterName = (user: typeof UserSummarySchema.Type | null | undefined): string | undefined =>
  user === null || user === undefined ? undefined : (fromNullable(user.displayName) ?? fromNullable(user.username))

const totalRecords = (response: {
  readonly totalResults?: number | null | undefined
  readonly pageInfo?: { readonly results?: number | null | undefined } | null | undefined
  readonly results: ReadonlyArray<unknown>
}): number => fromNullable(response.totalResults) ?? fromNullable(response.pageInfo?.results) ?? response.results.length

export const toSystemStatus = (status: typeof StatusSchema.Type): SystemStatus => ({
  version: fromNullable(status.version),
  commitTag: fromNullable(status.commitTag),
  updateAvailable: fromNullable(status.updateAvailable),
  commitsBehind: fromNullable(status.commitsBehind),
  restartRequired: fromNullable(status.restartRequired),
})

const toStatusValue = (value: number | string | null | undefined): StatusValue | undefined => fromNullable(value)

export const toMediaSummary = (media: typeof MediaSchema.Type): MediaSummary => ({
  id: media.id,
  tmdbId: fromNullable(media.tmdbId),
  mediaType: fromNullable(media.mediaType),
  status: toStatusValue(media.status),
  title: titleFrom(media.title, media.name),
  mediaAdded: fromNullable(media.mediaAdded),
})

export const toRequestRecord = (request: typeof RequestSchema.Type): RequestRecord => ({
  id: request.id,
  status: toStatusValue(request.status),
  type: fromNullable(request.type),
  createdAt: fromNullable(request.createdAt),
  updatedAt: fromNullable(request.updatedAt),
  requestedBy: requesterName(request.requestedBy),
  media: toMediaSummary(request.media),
})

export const toRequestListResult = (response: typeof RequestsResponseSchema.Type): ListResult<RequestRecord> => {
  const records = response.results.map(toRequestRecord)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

export const toRequestCounts = (counts: typeof RequestCountsSchema.Type): RequestCounts => counts

export const toSearchRecord = (record: typeof SearchRecordSchema.Type): SearchRecord => ({
  id: record.id,
  mediaType: fromNullable(record.mediaType),
  title: titleFrom(record.title, record.name),
  releaseDate: fromNullable(record.releaseDate),
  firstAirDate: fromNullable(record.firstAirDate),
  overview: fromNullable(record.overview),
})

export const toSearchListResult = (response: typeof SearchResponseSchema.Type): ListResult<SearchRecord> => {
  const records = response.results.map(toSearchRecord)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

export const toMediaListResult = (response: typeof MediaListResponseSchema.Type): ListResult<MediaSummary> => {
  const records = response.results.map(toMediaSummary)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

export const toUserRecord = (record: typeof UserRecordSchema.Type): UserRecord => ({
  id: record.id,
  email: fromNullable(record.email),
  displayName: fromNullable(record.displayName),
  username: fromNullable(record.jellyfinUsername) ?? fromNullable(record.plexUsername) ?? fromNullable(record.username),
  userType: fromNullable(record.userType),
  permissions: fromNullable(record.permissions),
})

export const toUserListResult = (response: typeof UserListResponseSchema.Type): ListResult<UserRecord> => {
  const records = response.results.map(toUserRecord)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

export const toIssueRecord = (record: typeof IssueRecordSchema.Type): IssueRecord => ({
  id: record.id,
  issueType: fromNullable(record.issueType),
  status: toStatusValue(record.status),
  createdAt: fromNullable(record.createdAt),
  createdBy: requesterName(record.createdBy),
  media: toMediaSummary(record.media),
})

export const toIssueListResult = (response: typeof IssueListResponseSchema.Type): ListResult<IssueRecord> => {
  const records = response.results.map(toIssueRecord)
  return { count: records.length, totalRecords: totalRecords(response), records }
}
