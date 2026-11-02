import * as Schema from 'effect/Schema'

// Thrown during bootstrap when the app's mount point is absent from the DOM.
export class MissingRoot extends Schema.TaggedError<MissingRoot>()('MissingRoot', {}) {}

// Returned when Better Auth responds with a non-success status.
export class BetterAuthHttpError extends Schema.TaggedError<BetterAuthHttpError>()('BetterAuthHttpError', {
  message: Schema.String,
}) {}

// Returned when browser file download mechanics fail.
export class BrowserDownloadError extends Schema.TaggedError<BrowserDownloadError>()('BrowserDownloadError', {
  message: Schema.String,
}) {}
