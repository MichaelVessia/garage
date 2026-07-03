import * as Schema from 'effect/Schema'

export class SeedError extends Schema.TaggedErrorClass<SeedError>()('SeedError', { message: Schema.String }) {}
