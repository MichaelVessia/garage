import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const StringArray = Schema.Array(Schema.String)

export const AutocaliwebConfigValue = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})
export type AutocaliwebConfigValue = typeof AutocaliwebConfigValue.Type

export const StatsResult = Schema.Struct({
  books: Schema.Number,
  authors: Schema.Number,
  categories: Schema.Number,
  series: Schema.Number,
})
export type StatsResult = typeof StatsResult.Type

export const StatusResult = Schema.Struct({
  title: OptionalString,
  updated: OptionalString,
  catalogCount: Schema.Number,
  stats: StatsResult,
})
export type StatusResult = typeof StatusResult.Type

export const CatalogEntry = Schema.Struct({
  title: OptionalString,
  id: OptionalString,
  href: OptionalString,
  content: OptionalString,
})
export type CatalogEntry = typeof CatalogEntry.Type

export const DownloadLink = Schema.Struct({
  href: Schema.String,
  format: OptionalString,
  mediaType: OptionalString,
  size: OptionalNumber,
})
export type DownloadLink = typeof DownloadLink.Type

export const BookRecord = Schema.Struct({
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
  downloads: Schema.Array(DownloadLink),
})
export type BookRecord = typeof BookRecord.Type

export const BookInfoRecord = Schema.Struct({
  ...BookRecord.fields,
  formats: StringArray,
  tags: StringArray,
  rating: OptionalString,
  lastModified: OptionalString,
  authorSort: OptionalString,
  titleSort: OptionalString,
})
export type BookInfoRecord = typeof BookInfoRecord.Type

export const SearchResult = Schema.Struct({
  query: Schema.String,
  total: Schema.Number,
  count: Schema.Number,
  records: Schema.Array(BookRecord),
})
export type SearchResult = typeof SearchResult.Type

export const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const SearchOptions = Schema.Struct({
  limit: Schema.Number,
  query: Schema.String,
})
export type SearchOptions = typeof SearchOptions.Type

export const BookInfoOptions = Schema.Struct({ uuid: Schema.String })
export type BookInfoOptions = typeof BookInfoOptions.Type

export const ListResult = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>
