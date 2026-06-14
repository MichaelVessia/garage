import * as Schema from 'effect/Schema'

export class CliVersioningError extends Schema.TaggedErrorClass<CliVersioningError>()('CliVersioningError', {
  message: Schema.String,
}) {}
