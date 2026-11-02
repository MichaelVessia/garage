import * as Schema from 'effect/Schema'

/** The page has no element to mount the app into. */
export class MissingRoot extends Schema.TaggedError<MissingRoot, { readonly brand: unique symbol }>()(
  'MissingRoot',
  {}
) {}
