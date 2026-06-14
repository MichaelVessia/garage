import * as Schema from 'effect/Schema'

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()('CliUsageError', {
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
}) {}
