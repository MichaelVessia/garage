import * as Schema from 'effect/Schema'

export class InvalidCommandError extends Schema.TaggedError<InvalidCommandError, { readonly brand: unique symbol }>()(
  'InvalidCommandError',
  {
    reason: Schema.String,
  }
) {}
