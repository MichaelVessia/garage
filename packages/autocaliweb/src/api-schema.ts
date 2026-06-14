import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import { BookInfoRecord as DomainBookInfoRecord, StatsResult as DomainStatsResult } from './model.js'
import type { BookInfoRecord, DownloadLink } from './model.js'

const NullableString = Schema.String.pipe(Schema.NullOr, Schema.optional)
const StringArray = Schema.Array(Schema.String).pipe(Schema.optional)

const StatsApi = Schema.Struct({
  books: Schema.Number,
  authors: Schema.Number,
  categories: Schema.Number,
  series: Schema.Number,
})

export const StatsSchema = StatsApi.pipe(Schema.decodeTo(DomainStatsResult))

const MainFormat = Schema.Record(Schema.String, Schema.String)
const OtherFormats = Schema.Record(Schema.String, Schema.String)

const BookInfoApi = Schema.Struct({
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
  main_format: Schema.optional(MainFormat),
  other_formats: Schema.optional(OtherFormats),
})

const optional = <A>(value: Option.Option<A>) => Option.getOrUndefined(value)

const fromFormats = (records: Option.Option<Readonly<Record<string, string>>>): ReadonlyArray<DownloadLink> =>
  Arr.map(R.toEntries(Option.getOrElse(records, () => ({}))), ([format, href]) => ({ format, href }))

const bookInfoRecordFromApi = (book: typeof BookInfoApi.Type): BookInfoRecord => {
  const downloads = [
    ...fromFormats(Option.fromNullishOr(book.main_format)),
    ...fromFormats(Option.fromNullishOr(book.other_formats)),
  ]
  return {
    id: String(book.application_id),
    uuid: book.uuid,
    urn: `urn:uuid:${book.uuid}`,
    title: optional(Option.fromNullishOr(book.title)),
    authors: book.authors ?? [],
    published: optional(Option.fromNullishOr(book.pubdate)),
    languages: book.languages ?? [],
    categories: book.tags ?? [],
    summary: optional(Option.fromNullishOr(book.comments)),
    downloads,
    formats: book.formats ?? [],
    tags: book.tags ?? [],
    rating: String(book.rating),
    lastModified: optional(Option.fromNullishOr(book.last_modified)),
    authorSort: optional(Option.fromNullishOr(book.author_sort)),
    titleSort: optional(Option.fromNullishOr(book.title_sort)),
  }
}

const bookInfoRecordToApi = (book: BookInfoRecord): typeof BookInfoApi.Type => ({
  pubdate: book.published,
  title: book.title,
  formats: book.formats,
  languages: book.languages,
  comments: book.summary,
  tags: book.tags,
  application_id: Number(book.id ?? 0),
  last_modified: book.lastModified,
  author_sort: book.authorSort,
  uuid: book.uuid ?? '',
  rating: book.rating ?? '',
  authors: book.authors,
  title_sort: book.titleSort,
})

export const BookInfoSchema = BookInfoApi.pipe(
  Schema.decodeTo(DomainBookInfoRecord, {
    decode: SchemaGetter.transform(bookInfoRecordFromApi),
    encode: SchemaGetter.transform(bookInfoRecordToApi),
  })
)
