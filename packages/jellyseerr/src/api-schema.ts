import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  IssueRecord as DomainIssueRecord,
  ListResultSchema as DomainListResultSchema,
  MediaSummary as DomainMediaSummary,
  RequestCounts as DomainRequestCounts,
  RequestRecord as DomainRequestRecord,
  SearchRecord as DomainSearchRecord,
  SystemStatus as DomainSystemStatus,
  UserRecord as DomainUserRecord,
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

const NullableString = Schema.NullOr(Schema.String).pipe(Schema.optional)
const NullableNumber = Schema.NullOr(Schema.Number).pipe(Schema.optional)
const NullableBoolean = Schema.NullOr(Schema.Boolean).pipe(Schema.optional)
const StatusValueApi = Schema.Union([Schema.Number, Schema.String]).pipe(Schema.NullOr, Schema.optional)

const PageInfo = Schema.Struct({ results: NullableNumber }).pipe(Schema.NullOr, Schema.optional)

const StatusApi = Schema.Struct({
  version: NullableString,
  commitTag: NullableString,
  updateAvailable: NullableBoolean,
  commitsBehind: NullableNumber,
  restartRequired: NullableBoolean,
})

const UserSummaryApi = Schema.Struct({
  displayName: NullableString,
  username: NullableString,
})

const MediaApi = Schema.Struct({
  id: Schema.Number,
  tmdbId: NullableNumber,
  mediaType: NullableString,
  status: StatusValueApi,
  title: NullableString,
  name: NullableString,
  mediaAdded: NullableString,
})

const RequestApi = Schema.Struct({
  id: Schema.Number,
  status: StatusValueApi,
  type: NullableString,
  createdAt: NullableString,
  updatedAt: NullableString,
  requestedBy: UserSummaryApi.pipe(Schema.NullOr, Schema.optional),
  media: MediaApi,
})

const RequestsResponseApi = Schema.Struct({
  pageInfo: PageInfo,
  totalResults: NullableNumber,
  results: Schema.Array(RequestApi),
})

export const RequestCountsSchema = DomainRequestCounts

const SearchRecordApi = Schema.Struct({
  id: Schema.Number,
  mediaType: NullableString,
  title: NullableString,
  name: NullableString,
  releaseDate: NullableString,
  firstAirDate: NullableString,
  overview: NullableString,
})

const SearchResponseApi = Schema.Struct({
  pageInfo: PageInfo,
  totalResults: NullableNumber,
  results: Schema.Array(SearchRecordApi),
})

const MediaListResponseApi = Schema.Struct({
  pageInfo: PageInfo,
  totalResults: NullableNumber,
  results: Schema.Array(MediaApi),
})

const UserRecordApi = Schema.Struct({
  id: Schema.Number,
  email: NullableString,
  displayName: NullableString,
  jellyfinUsername: NullableString,
  plexUsername: NullableString,
  username: NullableString,
  userType: NullableNumber,
  permissions: NullableNumber,
})

const UserListResponseApi = Schema.Struct({
  pageInfo: PageInfo,
  totalResults: NullableNumber,
  results: Schema.Array(UserRecordApi),
})

const IssueRecordApi = Schema.Struct({
  id: Schema.Number,
  issueType: NullableString,
  status: StatusValueApi,
  createdAt: NullableString,
  createdBy: UserSummaryApi.pipe(Schema.NullOr, Schema.optional),
  media: MediaApi,
})

const IssueListResponseApi = Schema.Struct({
  pageInfo: PageInfo,
  totalResults: NullableNumber,
  results: Schema.Array(IssueRecordApi),
})

// oxlint-disable-next-line effect/prefer-option-over-null -- wire-boundary helper: external Jellyseerr API sends null; domain records use `| undefined` optional fields.
const fromNullable = <A>(value: A | null | undefined): A | undefined =>
  Option.getOrUndefined(Option.fromNullishOr(value))

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper producing the Schema.optional domain shape (`string | undefined`)
const titleFrom = (title: string | undefined, name: string | undefined): string | undefined =>
  fromNullable(title) ?? fromNullable(name)

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper producing the Schema.optional domain shape (`string | undefined`)
const requesterName = (user: typeof UserSummaryApi.Type | undefined): string | undefined =>
  user === undefined ? undefined : (fromNullable(user.displayName) ?? fromNullable(user.username))

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper bridging Schema.optional wire values (`number | undefined`) into a record count
const totalRecords = (totalResults: number | undefined, pageResults: number | undefined, recordCount: number): number =>
  Option.getOrElse(
    Option.orElse(Option.fromNullishOr(totalResults), () => Option.fromNullishOr(pageResults)),
    () => recordCount
  )

const systemStatusFromApi = (status: typeof StatusApi.Type): SystemStatus => ({
  version: fromNullable(status.version),
  commitTag: fromNullable(status.commitTag),
  updateAvailable: fromNullable(status.updateAvailable),
  commitsBehind: fromNullable(status.commitsBehind),
  restartRequired: fromNullable(status.restartRequired),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApi.Type => ({
  version: status.version,
  commitTag: status.commitTag,
  updateAvailable: status.updateAvailable,
  commitsBehind: status.commitsBehind,
  restartRequired: status.restartRequired,
})

export const StatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary helper producing the Schema.optional domain shape (`StatusValue | undefined`)
const statusValueFromApi = (value: typeof StatusValueApi.Type): StatusValue | undefined => fromNullable(value)

const mediaSummaryFromApi = (media: typeof MediaApi.Type): MediaSummary => ({
  id: media.id,
  tmdbId: fromNullable(media.tmdbId),
  mediaType: fromNullable(media.mediaType),
  status: statusValueFromApi(media.status),
  title: titleFrom(fromNullable(media.title), fromNullable(media.name)),
  mediaAdded: fromNullable(media.mediaAdded),
})

const mediaSummaryToApi = (media: MediaSummary): typeof MediaApi.Type => ({
  id: media.id,
  tmdbId: media.tmdbId,
  mediaType: media.mediaType,
  status: media.status,
  title: media.title,
  mediaAdded: media.mediaAdded,
})

export const MediaSchema = MediaApi.pipe(
  Schema.decodeTo(DomainMediaSummary, {
    decode: SchemaGetter.transform(mediaSummaryFromApi),
    encode: SchemaGetter.transform(mediaSummaryToApi),
  })
)

export const MediaResponseSchema = MediaSchema

const requestRecordFromApi = (request: typeof RequestApi.Type): RequestRecord => ({
  id: request.id,
  status: statusValueFromApi(request.status),
  type: fromNullable(request.type),
  createdAt: fromNullable(request.createdAt),
  updatedAt: fromNullable(request.updatedAt),
  requestedBy: requesterName(fromNullable(request.requestedBy)),
  media: mediaSummaryFromApi(request.media),
})

const requestRecordToApi = (request: RequestRecord): typeof RequestApi.Type => ({
  id: request.id,
  status: request.status,
  type: request.type,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  requestedBy: request.requestedBy === undefined ? undefined : { displayName: request.requestedBy },
  media: mediaSummaryToApi(request.media),
})

export const RequestSchema = RequestApi.pipe(
  Schema.decodeTo(DomainRequestRecord, {
    decode: SchemaGetter.transform(requestRecordFromApi),
    encode: SchemaGetter.transform(requestRecordToApi),
  })
)

const searchRecordFromApi = (record: typeof SearchRecordApi.Type): SearchRecord => ({
  id: record.id,
  mediaType: fromNullable(record.mediaType),
  title: titleFrom(fromNullable(record.title), fromNullable(record.name)),
  releaseDate: fromNullable(record.releaseDate),
  firstAirDate: fromNullable(record.firstAirDate),
  overview: fromNullable(record.overview),
})

const searchRecordToApi = (record: SearchRecord): typeof SearchRecordApi.Type => ({
  id: record.id,
  mediaType: record.mediaType,
  title: record.title,
  releaseDate: record.releaseDate,
  firstAirDate: record.firstAirDate,
  overview: record.overview,
})

const userRecordFromApi = (record: typeof UserRecordApi.Type): UserRecord => ({
  id: record.id,
  email: fromNullable(record.email),
  displayName: fromNullable(record.displayName),
  username: fromNullable(record.jellyfinUsername) ?? fromNullable(record.plexUsername) ?? fromNullable(record.username),
  userType: fromNullable(record.userType),
  permissions: fromNullable(record.permissions),
})

const userRecordToApi = (record: UserRecord): typeof UserRecordApi.Type => ({
  id: record.id,
  email: record.email,
  displayName: record.displayName,
  jellyfinUsername: record.username,
  username: record.username,
  userType: record.userType,
  permissions: record.permissions,
})

const issueRecordFromApi = (record: typeof IssueRecordApi.Type): IssueRecord => ({
  id: record.id,
  issueType: fromNullable(record.issueType),
  status: statusValueFromApi(record.status),
  createdAt: fromNullable(record.createdAt),
  createdBy: requesterName(fromNullable(record.createdBy)),
  media: mediaSummaryFromApi(record.media),
})

const issueRecordToApi = (record: IssueRecord): typeof IssueRecordApi.Type => ({
  id: record.id,
  issueType: record.issueType,
  status: record.status,
  createdAt: record.createdAt,
  createdBy: record.createdBy === undefined ? undefined : { displayName: record.createdBy },
  media: mediaSummaryToApi(record.media),
})

const requestListFromApi = (response: typeof RequestsResponseApi.Type): ListResult<RequestRecord> => {
  const records = response.results.map(requestRecordFromApi)
  return {
    count: records.length,
    totalRecords: totalRecords(
      fromNullable(response.totalResults),
      fromNullable(response.pageInfo?.results),
      records.length
    ),
    records,
  }
}

const requestListToApi = (result: ListResult<RequestRecord>): typeof RequestsResponseApi.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(requestRecordToApi),
})

export const RequestsResponseSchema = RequestsResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainRequestRecord), {
    decode: SchemaGetter.transform(requestListFromApi),
    encode: SchemaGetter.transform(requestListToApi),
  })
)

const searchListFromApi = (response: typeof SearchResponseApi.Type): ListResult<SearchRecord> => {
  const records = response.results.map(searchRecordFromApi)
  return {
    count: records.length,
    totalRecords: totalRecords(
      fromNullable(response.totalResults),
      fromNullable(response.pageInfo?.results),
      records.length
    ),
    records,
  }
}

const searchListToApi = (result: ListResult<SearchRecord>): typeof SearchResponseApi.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(searchRecordToApi),
})

export const SearchResponseSchema = SearchResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainSearchRecord), {
    decode: SchemaGetter.transform(searchListFromApi),
    encode: SchemaGetter.transform(searchListToApi),
  })
)

const mediaListFromApi = (response: typeof MediaListResponseApi.Type): ListResult<MediaSummary> => {
  const records = response.results.map(mediaSummaryFromApi)
  return {
    count: records.length,
    totalRecords: totalRecords(
      fromNullable(response.totalResults),
      fromNullable(response.pageInfo?.results),
      records.length
    ),
    records,
  }
}

const mediaListToApi = (result: ListResult<MediaSummary>): typeof MediaListResponseApi.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(mediaSummaryToApi),
})

export const MediaListResponseSchema = MediaListResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainMediaSummary), {
    decode: SchemaGetter.transform(mediaListFromApi),
    encode: SchemaGetter.transform(mediaListToApi),
  })
)

const userListFromApi = (response: typeof UserListResponseApi.Type): ListResult<UserRecord> => {
  const records = response.results.map(userRecordFromApi)
  return {
    count: records.length,
    totalRecords: totalRecords(
      fromNullable(response.totalResults),
      fromNullable(response.pageInfo?.results),
      records.length
    ),
    records,
  }
}

const userListToApi = (result: ListResult<UserRecord>): typeof UserListResponseApi.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(userRecordToApi),
})

export const UserListResponseSchema = UserListResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainUserRecord), {
    decode: SchemaGetter.transform(userListFromApi),
    encode: SchemaGetter.transform(userListToApi),
  })
)

const issueListFromApi = (response: typeof IssueListResponseApi.Type): ListResult<IssueRecord> => {
  const records = response.results.map(issueRecordFromApi)
  return {
    count: records.length,
    totalRecords: totalRecords(
      fromNullable(response.totalResults),
      fromNullable(response.pageInfo?.results),
      records.length
    ),
    records,
  }
}

const issueListToApi = (result: ListResult<IssueRecord>): typeof IssueListResponseApi.Type => ({
  totalResults: result.totalRecords,
  results: result.records.map(issueRecordToApi),
})

export const IssueListResponseSchema = IssueListResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainIssueRecord), {
    decode: SchemaGetter.transform(issueListFromApi),
    encode: SchemaGetter.transform(issueListToApi),
  })
)
