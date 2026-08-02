import * as Schema from 'effect/Schema'

// Thrown during bootstrap when the app's mount point is absent from the DOM.
export class MissingRoot extends Schema.TaggedErrorClass<MissingRoot>()('MissingRoot', {}) {}

// Returned when Better Auth responds with a non-success status.
export class BetterAuthHttpError extends Schema.TaggedErrorClass<BetterAuthHttpError>()('BetterAuthHttpError', {
  message: Schema.String,
}) {}
