import * as Schema from 'effect/Schema'

// Shared shape for the service packages' paginated/list results: a record
// count alongside the records themselves. Packages that need more (a total
// distinct from the page count, a truncation flag, ...) spread `.fields`
// from this factory and add their own extra fields on top.
export const ListResultSchema = <Record>(record: Schema.Codec<Record>) =>
  Schema.Struct({
    count: Schema.Number,
    records: Schema.Array(record),
  })
export type ListResultSchema<Record> = Schema.Schema.Type<ReturnType<typeof ListResultSchema<Record>>>

export const listResult = <Record>(records: ReadonlyArray<Record>): ListResultSchema<Record> => ({
  count: records.length,
  records,
})
