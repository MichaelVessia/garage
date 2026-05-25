import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const StringArray = Schema.Array(Schema.String)

export const AutocaliwebConfigValueSchema = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type AutocaliwebConfigValue = typeof AutocaliwebConfigValueSchema.Type

export const StatsResultSchema = Schema.Struct({
  books: Schema.Number,
  authors: Schema.Number,
  categories: Schema.Number,
  series: Schema.Number,
})
export type StatsResult = typeof StatsResultSchema.Type

export const StatusResultSchema = Schema.Struct({
  title: OptionalString,
  updated: OptionalString,
  catalogCount: Schema.Number,
  stats: StatsResultSchema,
})
export type StatusResult = typeof StatusResultSchema.Type

export const CatalogEntrySchema = Schema.Struct({
  title: OptionalString,
  id: OptionalString,
  href: OptionalString,
  content: OptionalString,
})
export type CatalogEntry = typeof CatalogEntrySchema.Type

export const DownloadLinkSchema = Schema.Struct({
  href: Schema.String,
  format: OptionalString,
  mediaType: OptionalString,
  size: OptionalNumber,
})
export type DownloadLink = typeof DownloadLinkSchema.Type

export const BookRecordSchema = Schema.Struct({
  id: OptionalString,
  uuid: OptionalString,
  urn: OptionalString,
  title: OptionalString,
  authors: StringArray,
  published: OptionalString,
  updated: OptionalString,
  languages: StringArray,
  categories: StringArray,
  summary: OptionalString,
  coverHref: OptionalString,
  downloads: Schema.Array(DownloadLinkSchema),
})
export type BookRecord = typeof BookRecordSchema.Type

export const BookInfoRecordSchema = Schema.Struct({
  ...BookRecordSchema.fields,
  formats: StringArray,
  tags: StringArray,
  rating: OptionalString,
  lastModified: OptionalString,
  authorSort: OptionalString,
  titleSort: OptionalString,
})
export type BookInfoRecord = typeof BookInfoRecordSchema.Type

export const SearchResultSchema = Schema.Struct({
  query: Schema.String,
  total: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(BookRecordSchema),
})
export type SearchResult = typeof SearchResultSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const SearchOptionsSchema = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptionsSchema.Type

export const BookInfoOptionsSchema = Schema.Struct({ uuid: Schema.String })
export type BookInfoOptions = typeof BookInfoOptionsSchema.Type

export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>
