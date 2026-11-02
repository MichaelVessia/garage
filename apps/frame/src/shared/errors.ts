import * as Schema from 'effect/Schema'

/** Upstream systems the frame reads from. */
const UpstreamSource = Schema.Literals(['calendar', 'home-assistant'])
/** Upstream systems the frame reads from. */
export type UpstreamSource = typeof UpstreamSource.Type

/** The server refused a media change that is not configured or not allowed. */
export class MediaActionRejected extends Schema.TaggedErrorClass<MediaActionRejected>()('MediaActionRejected', {
  message: Schema.String,
}) {}

/** A credential-free failure the frame can show and retry. */
export class UpstreamUnavailable extends Schema.TaggedErrorClass<UpstreamUnavailable>()('UpstreamUnavailable', {
  source: UpstreamSource,
  message: Schema.String,
}) {}
