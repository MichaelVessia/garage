import { Schema, SchemaGetter } from 'effect'

import {
  IssueRecordSchema as DomainIssueRecordSchema,
  ListResultSchema as DomainListResultSchema,
  MediaSummarySchema as DomainMediaSummarySchema,
  RequestCountsSchema as DomainRequestCountsSchema,
  RequestRecordSchema as DomainRequestRecordSchema,
  SearchRecordSchema as DomainSearchRecordSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
  UserRecordSchema as DomainUserRecordSchema,
} from './model.js'
import type {
  IssueRecord,
  ListResult,
  MediaSummary,
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

const StatusApiSchema = Schema.Struct({
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

const MediaApiSchema = Schema.Struct({
  id: Schema.Number,
  tmdbId: NullableNumber,
  mediaType: NullableString,
  status: StatusValueSchema,
  title: NullableString,
  name: NullableString,
  mediaAdded: NullableString,
})

const RequestApiSchema = Schema.Struct({
  id: Schema.Number,
  status: StatusValueSchema,
  type: NullableString,
  createdAt: NullableString,
  updatedAt: NullableString,
  requestedBy: Schema.optional(Schema.NullOr(UserSummarySchema)),
  media: MediaApiSchema,
})

const RequestsResponseApiSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(RequestApiSchema),
})

export const RequestCountsSchema = DomainRequestCountsSchema

const SearchRecordApiSchema = Schema.Struct({
  id: Schema.Number,
  mediaType: NullableString,
  title: NullableString,
  name: NullableString,
  releaseDate: NullableString,
  firstAirDate: NullableString,
  overview: NullableString,
})

const SearchResponseApiSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(SearchRecordApiSchema),
})

const MediaListResponseApiSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(MediaApiSchema),
})

const UserRecordApiSchema = Schema.Struct({
  id: Schema.Number,
  email: NullableString,
  displayName: NullableString,
  jellyfinUsername: NullableString,
  plexUsername: NullableString,
  username: NullableString,
  userType: NullableNumber,
  permissions: NullableNumber,
})

const UserListResponseApiSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(UserRecordApiSchema),
})

const IssueRecordApiSchema = Schema.Struct({
  id: Schema.Number,
  issueType: NullableString,
  status: StatusValueSchema,
  createdAt: NullableString,
  createdBy: Schema.optional(Schema.NullOr(UserSummarySchema)),
  media: MediaApiSchema,
})

const IssueListResponseApiSchema = Schema.Struct({
  pageInfo: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        results: NullableNumber,
      })
    )
  ),
  totalResults: NullableNumber,
  results: Schema.Array(IssueRecordApiSchema),
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

const systemStatusFromApi = (status: typeof StatusApiSchema.Type): SystemStatus => ({
  version: fromNullable(status.version),
  commitTag: fromNullable(status.commitTag),
  updateAvailable: fromNullable(status.updateAvailable),
  commitsBehind: fromNullable(status.commitsBehind),
  restartRequired: fromNullable(status.restartRequired),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApiSchema.Type => ({
  version: status.version,
  commitTag: status.commitTag,
  updateAvailable: status.updateAvailable,
  commitsBehind: status.commitsBehind,
  restartRequired: status.restartRequired,
})

export const StatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const statusValueFromApi = (value: number | string | null | undefined): StatusValue | undefined => fromNullable(value)

const mediaSummaryFromApi = (media: typeof MediaApiSchema.Type): MediaSummary => ({
  id: media.id,
  tmdbId: fromNullable(media.tmdbId),
  mediaType: fromNullable(media.mediaType),
  status: statusValueFromApi(media.status),
  title: titleFrom(media.title, media.name),
  mediaAdded: fromNullable(media.mediaAdded),
})

const mediaSummaryToApi = (media: MediaSummary): typeof MediaApiSchema.Type => ({
  id: media.id,
  tmdbId: media.tmdbId,
  mediaType: media.mediaType,
  status: media.status,
  title: media.title,
  mediaAdded: media.mediaAdded,
})

export const MediaSchema = MediaApiSchema.pipe(
  Schema.decodeTo(DomainMediaSummarySchema, {
    decode: SchemaGetter.transform(mediaSummaryFromApi),
    encode: SchemaGetter.transform(mediaSummaryToApi),
  })
)

export const MediaResponseSchema = MediaSchema

const requestRecordFromApi = (request: typeof RequestApiSchema.Type): RequestRecord => ({
  id: request.id,
  status: statusValueFromApi(request.status),
  type: fromNullable(request.type),
  createdAt: fromNullable(request.createdAt),
  updatedAt: fromNullable(request.updatedAt),
  requestedBy: requesterName(request.requestedBy),
  media: mediaSummaryFromApi(request.media),
})

const requestRecordToApi = (request: RequestRecord): typeof RequestApiSchema.Type => ({
  id: request.id,
  status: request.status,
  type: request.type,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  requestedBy: request.requestedBy === undefined ? undefined : { displayName: request.requestedBy },
  media: mediaSummaryToApi(request.media),
})

export const RequestSchema = RequestApiSchema.pipe(
  Schema.decodeTo(DomainRequestRecordSchema, {
    decode: SchemaGetter.transform(requestRecordFromApi),
    encode: SchemaGetter.transform(requestRecordToApi),
  })
)

const searchRecordFromApi = (record: typeof SearchRecordApiSchema.Type): SearchRecord => ({
  id: record.id,
  mediaType: fromNullable(record.mediaType),
  title: titleFrom(record.title, record.name),
  releaseDate: fromNullable(record.releaseDate),
  firstAirDate: fromNullable(record.firstAirDate),
  overview: fromNullable(record.overview),
})

const searchRecordToApi = (record: SearchRecord): typeof SearchRecordApiSchema.Type => ({
  id: record.id,
  mediaType: record.mediaType,
  title: record.title,
  releaseDate: record.releaseDate,
  firstAirDate: record.firstAirDate,
  overview: record.overview,
})

const userRecordFromApi = (record: typeof UserRecordApiSchema.Type): UserRecord => ({
  id: record.id,
  email: fromNullable(record.email),
  displayName: fromNullable(record.displayName),
  username: fromNullable(record.jellyfinUsername) ?? fromNullable(record.plexUsername) ?? fromNullable(record.username),
  userType: fromNullable(record.userType),
  permissions: fromNullable(record.permissions),
})

const userRecordToApi = (record: UserRecord): typeof UserRecordApiSchema.Type => ({
  id: record.id,
  email: record.email,
  displayName: record.displayName,
  jellyfinUsername: record.username,
  username: record.username,
  userType: record.userType,
  permissions: record.permissions,
})

const issueRecordFromApi = (record: typeof IssueRecordApiSchema.Type): IssueRecord => ({
  id: record.id,
  issueType: fromNullable(record.issueType),
  status: statusValueFromApi(record.status),
  createdAt: fromNullable(record.createdAt),
  createdBy: requesterName(record.createdBy),
  media: mediaSummaryFromApi(record.media),
})

const issueRecordToApi = (record: IssueRecord): typeof IssueRecordApiSchema.Type => ({
  id: record.id,
  issueType: record.issueType,
  status: record.status,
  createdAt: record.createdAt,
  createdBy: record.createdBy === undefined ? undefined : { displayName: record.createdBy },
  media: mediaSummaryToApi(record.media),
})

const requestListFromApi = (response: typeof RequestsResponseApiSchema.Type): ListResult<RequestRecord> => {
  const records = response.results.map(requestRecordFromApi)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

const requestListToApi = (result: ListResult<RequestRecord>): typeof RequestsResponseApiSchema.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(requestRecordToApi),
})

export const RequestsResponseSchema = RequestsResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainRequestRecordSchema), {
    decode: SchemaGetter.transform(requestListFromApi),
    encode: SchemaGetter.transform(requestListToApi),
  })
)

const searchListFromApi = (response: typeof SearchResponseApiSchema.Type): ListResult<SearchRecord> => {
  const records = response.results.map(searchRecordFromApi)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

const searchListToApi = (result: ListResult<SearchRecord>): typeof SearchResponseApiSchema.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(searchRecordToApi),
})

export const SearchResponseSchema = SearchResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainSearchRecordSchema), {
    decode: SchemaGetter.transform(searchListFromApi),
    encode: SchemaGetter.transform(searchListToApi),
  })
)

const mediaListFromApi = (response: typeof MediaListResponseApiSchema.Type): ListResult<MediaSummary> => {
  const records = response.results.map(mediaSummaryFromApi)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

const mediaListToApi = (result: ListResult<MediaSummary>): typeof MediaListResponseApiSchema.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(mediaSummaryToApi),
})

export const MediaListResponseSchema = MediaListResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainMediaSummarySchema), {
    decode: SchemaGetter.transform(mediaListFromApi),
    encode: SchemaGetter.transform(mediaListToApi),
  })
)

const userListFromApi = (response: typeof UserListResponseApiSchema.Type): ListResult<UserRecord> => {
  const records = response.results.map(userRecordFromApi)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

const userListToApi = (result: ListResult<UserRecord>): typeof UserListResponseApiSchema.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(userRecordToApi),
})

export const UserListResponseSchema = UserListResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainUserRecordSchema), {
    decode: SchemaGetter.transform(userListFromApi),
    encode: SchemaGetter.transform(userListToApi),
  })
)

const issueListFromApi = (response: typeof IssueListResponseApiSchema.Type): ListResult<IssueRecord> => {
  const records = response.results.map(issueRecordFromApi)
  return { count: records.length, totalRecords: totalRecords(response), records }
}

const issueListToApi = (result: ListResult<IssueRecord>): typeof IssueListResponseApiSchema.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(issueRecordToApi),
})

export const IssueListResponseSchema = IssueListResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainIssueRecordSchema), {
    decode: SchemaGetter.transform(issueListFromApi),
    encode: SchemaGetter.transform(issueListToApi),
  })
)
