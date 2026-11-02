import * as Schema from 'effect/Schema'

export class SeedError extends Schema.TaggedError<SeedError>()('SeedError', { message: Schema.String }) {}
