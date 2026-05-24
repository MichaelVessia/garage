import { Schema } from 'effect'

import type { BookInfoRecord, DownloadLink, StatsResult } from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const StringArray = Schema.optional(Schema.Array(Schema.String))

export const StatsSchema = Schema.Struct({
  books: Schema.Number,
  authors: Schema.Number,
  categories: Schema.Number,
  series: Schema.Number,
})

const MainFormatSchema = Schema.Record(Schema.String, Schema.String)
const OtherFormatsSchema = Schema.Record(Schema.String, Schema.String)

export const BookInfoSchema = Schema.Struct({
  pubdate: NullableString,
  title: NullableString,
  formats: StringArray,
  languages: StringArray,
  comments: NullableString,
  tags: StringArray,
  application_id: Schema.Number,
  last_modified: NullableString,
  author_sort: NullableString,
  uuid: Schema.String,
  rating: Schema.Union([Schema.String, Schema.Number]),
  authors: StringArray,
  title_sort: NullableString,
  main_format: Schema.optional(MainFormatSchema),
  other_formats: Schema.optional(OtherFormatsSchema),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const fromFormats = (records: Readonly<Record<string, string>> | undefined): ReadonlyArray<DownloadLink> =>
  Object.entries(records ?? {}).map(([format, href]) => ({ format, href }))

export const toStatsResult = (stats: typeof StatsSchema.Type): StatsResult => stats

export const toBookInfoRecord = (book: typeof BookInfoSchema.Type): BookInfoRecord => {
  const downloads = [...fromFormats(book.main_format), ...fromFormats(book.other_formats)]
  return {
    id: String(book.application_id),
    uuid: book.uuid,
    urn: `urn:uuid:${book.uuid}`,
    title: fromNullable(book.title),
    authors: book.authors ?? [],
    published: fromNullable(book.pubdate),
    languages: book.languages ?? [],
    categories: book.tags ?? [],
    summary: fromNullable(book.comments),
    downloads,
    formats: book.formats ?? [],
    tags: book.tags ?? [],
    rating: String(book.rating),
    lastModified: fromNullable(book.last_modified),
    authorSort: fromNullable(book.author_sort),
    titleSort: fromNullable(book.title_sort),
  }
}
