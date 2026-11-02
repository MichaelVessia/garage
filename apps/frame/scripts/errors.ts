import * as Schema from 'effect/Schema'

/** The built frontend uses features the frame's WebView 106 does not support. */
export class WebviewIncompatible extends Schema.TaggedError<WebviewIncompatible, { readonly brand: unique symbol }>()(
  'WebviewIncompatible',
  {
    findings: Schema.Array(Schema.String),
  }
) {}

/** The frame host's Docker daemon did not load the Nix-built image. */
export class ImageLoadFailed extends Schema.TaggedError<ImageLoadFailed, { readonly brand: unique symbol }>()(
  'ImageLoadFailed',
  {
    image: Schema.String,
    exitCode: Schema.Int,
    message: Schema.String,
  }
) {}

/** The shipped build failed a check in Chromium 106 before deploy. */
export class PreflightFailed extends Schema.TaggedError<PreflightFailed, { readonly brand: unique symbol }>()(
  'PreflightFailed',
  {
    check: Schema.String,
    message: Schema.String,
  }
) {}

/** The deployed server did not report the expected build in time. */
export class DeployNotLive extends Schema.TaggedError<DeployNotLive, { readonly brand: unique symbol }>()(
  'DeployNotLive',
  {
    expected: Schema.String,
    observed: Schema.String,
    message: Schema.String,
  }
) {}
