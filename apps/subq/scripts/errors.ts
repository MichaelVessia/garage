import * as Schema from 'effect/Schema'

export class SeedError extends Schema.TaggedError<SeedError, { readonly brand: unique symbol }>()('SeedError', {
  message: Schema.String,
}) {}
