import * as Schema from 'effect/Schema'

/** Upstream systems the frame reads from. */
const UpstreamSource = Schema.Literals(['calendar', 'home-assistant'])
/** Upstream systems the frame reads from. */
export type UpstreamSource = typeof UpstreamSource.Type

/** A credential-free failure the frame can show and retry. */
export class UpstreamUnavailable extends Schema.TaggedErrorClass<UpstreamUnavailable>()('UpstreamUnavailable', {
  source: UpstreamSource,
  message: Schema.String,
}) {}
