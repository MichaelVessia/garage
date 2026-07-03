import * as Schema from 'effect/Schema'

export class BetterAuthApiError extends Schema.TaggedClass<BetterAuthApiError>()('BetterAuthApiError', {
  cause: Schema.Defect(),
}) {}
