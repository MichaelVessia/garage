import { Schema } from 'effect'

import type {
  BookMetadata,
  BookRecord,
  CurrentUser,
  JsonObject,
  LibraryPath,
  LibraryRecord,
  ListResult,
  SearchResult,
  VersionResult,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])
const AuthorsSchema = Schema.Union([Schema.String, Schema.Array(Schema.String)])
export const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown)

export const LoginResponseSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: NullableString,
  isDefaultPassword: Schema.optional(Schema.NullOr(Schema.Boolean)),
})

export const VersionSchema = Schema.Struct({
  current: NullableString,
  latest: NullableString,
})

const LibraryPathSchema = Schema.Struct({
  id: Schema.optional(Schema.NullOr(StringOrNumber)),
  path: NullableString,
})

export const LibrarySchema = Schema.Struct({
  id: StringOrNumber,
  name: NullableString,
  paths: Schema.optional(Schema.NullOr(Schema.Array(LibraryPathSchema))),
})

const MetadataSchema = Schema.Struct({
  title: NullableString,
  authors: Schema.optional(Schema.NullOr(AuthorsSchema)),
  publishedDate: NullableString,
})

export const BookSchema = Schema.Struct({
  id: StringOrNumber,
  title: NullableString,
  authors: Schema.optional(Schema.NullOr(AuthorsSchema)),
  libraryId: Schema.optional(Schema.NullOr(StringOrNumber)),
  metadata: Schema.optional(Schema.NullOr(MetadataSchema)),
})

export const UserSchema = Schema.Struct({
  id: StringOrNumber,
  username: NullableString,
  email: NullableString,
  permissions: Schema.optional(Schema.NullOr(JsonObjectSchema)),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const toAuthors = (authors: typeof AuthorsSchema.Type | null | undefined): ReadonlyArray<string> | undefined => {
  if (authors === null || authors === undefined) {
    return undefined
  }
  return typeof authors === 'string' ? [authors] : authors
}

const toMetadata = (metadata: typeof MetadataSchema.Type | null | undefined): BookMetadata | undefined => {
  if (metadata === null || metadata === undefined) {
    return undefined
  }
  return {
    title: fromNullable(metadata.title),
    authors: toAuthors(metadata.authors),
    publishedDate: fromNullable(metadata.publishedDate),
  }
}

const metadataTitle = (metadata: typeof MetadataSchema.Type | null | undefined): string | undefined =>
  metadata === null || metadata === undefined ? undefined : fromNullable(metadata.title)

const metadataAuthors = (metadata: typeof MetadataSchema.Type | null | undefined): ReadonlyArray<string> | undefined =>
  metadata === null || metadata === undefined ? undefined : toAuthors(metadata.authors)

export const toVersionResult = (version: typeof VersionSchema.Type): VersionResult => ({
  current: fromNullable(version.current),
  latest: fromNullable(version.latest),
})

export const toCurrentUser = (user: typeof UserSchema.Type): CurrentUser => ({
  id: user.id,
  username: fromNullable(user.username),
  email: fromNullable(user.email),
  permissions: fromNullable(user.permissions),
})

export const toLibraryPath = (path: typeof LibraryPathSchema.Type): LibraryPath => ({
  id: fromNullable(path.id),
  path: fromNullable(path.path),
})

export const toLibraryRecord = (library: typeof LibrarySchema.Type): LibraryRecord => ({
  id: library.id,
  name: fromNullable(library.name),
  paths: (library.paths ?? []).map(toLibraryPath),
})

export const toBookRecord = (book: typeof BookSchema.Type): BookRecord => ({
  id: book.id,
  title: fromNullable(book.title) ?? metadataTitle(book.metadata),
  authors: toAuthors(book.authors) ?? metadataAuthors(book.metadata),
  libraryId: fromNullable(book.libraryId),
  metadata: toMetadata(book.metadata),
})

export const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

export const toSearchResult = (query: string, records: ReadonlyArray<BookRecord>, total: number): SearchResult => ({
  query,
  total,
  count: records.length,
  records,
})

export const toJsonObjects = (records: ReadonlyArray<typeof JsonObjectSchema.Type>): ReadonlyArray<JsonObject> =>
  records
