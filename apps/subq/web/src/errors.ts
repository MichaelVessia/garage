import * as Schema from 'effect/Schema'

// Thrown during bootstrap when the app's mount point is absent from the DOM.
export class MissingRoot extends Schema.TaggedErrorClass<MissingRoot>()('MissingRoot', {}) {}
