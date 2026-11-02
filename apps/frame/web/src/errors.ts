import * as Schema from 'effect/Schema'

/** The page has no element to mount the app into. */
export class MissingRoot extends Schema.TaggedErrorClass<MissingRoot>()('MissingRoot', {}) {}
