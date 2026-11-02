import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalFinite = Schema.optional(Schema.Finite)
const StringArray = Schema.Array(Schema.String)

const AutocaliwebConfigValue = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.RedactedFromValue(Schema.String),
})

export type AutocaliwebConfigValue = typeof AutocaliwebConfigValue.Type

export const StatsResult = Schema.Struct({
  books: Schema.Int,
  authors: Schema.Int,
  categories: Schema.Int,
  series: Schema.Int,
})

export type StatsResult = typeof StatsResult.Type

export const StatusResult = Schema.Struct({
  title: OptionalString,
  updated: OptionalString,
  catalogCount: Schema.Int,
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

const DownloadLink = Schema.Struct({
  href: Schema.String,
  format: OptionalString,
  mediaType: OptionalString,
  size: OptionalFinite,
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
  total: Schema.Int,
  count: Schema.Int,
  records: Schema.Array(BookRecord),
})

export type SearchResult = typeof SearchResult.Type

const LimitOptions = Schema.Struct({ limit: Schema.Int })

export type LimitOptions = typeof LimitOptions.Type

const SearchOptions = Schema.Struct({
  limit: Schema.Int,
  query: Schema.String,
})

export type SearchOptions = typeof SearchOptions.Type

const BookInfoOptions = Schema.Struct({ uuid: Schema.String })

export type BookInfoOptions = typeof BookInfoOptions.Type

// Type alias rather than interface: a Schema field record needs the implicit
// index signature that only type aliases receive.
type ListResultFields<Record> = Readonly<{
  count: Schema.Int
  records: Schema.$Array<Schema.Codec<Record>>
}>

export const ListResult = <Record>(record: Schema.Codec<Record>): Schema.Struct<ListResultFields<Record>> =>
  Schema.Struct({
    count: Schema.Int,
    records: Schema.Array(record),
  })

export type ListResult<Record> = Schema.Schema.Type<ReturnType<typeof ListResult<Record>>>
