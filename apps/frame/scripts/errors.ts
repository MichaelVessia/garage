import * as Schema from 'effect/Schema'

/** The built frontend uses features the frame's WebView 106 does not support. */
export class WebviewIncompatible extends Schema.TaggedErrorClass<WebviewIncompatible>()('WebviewIncompatible', {
  findings: Schema.Array(Schema.String),
}) {}
