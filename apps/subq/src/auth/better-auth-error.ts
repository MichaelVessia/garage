import * as Schema from 'effect/Schema'

export class BetterAuthApiError extends Schema.TaggedClass<BetterAuthApiError, { readonly brand: unique symbol }>()(
  'BetterAuthApiError',
  {
    cause: Schema.Defect(),
  }
) {}
