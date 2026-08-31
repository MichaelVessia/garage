import * as Schema from 'effect/Schema'

// Signals the read-back after an upsert unexpectedly found no row. Kept as a
// tagged error so it composes as a typed `cause` rather than a bare Error.
export class SettingsMissingAfterUpsert extends Schema.TaggedErrorClass<SettingsMissingAfterUpsert>()(
  'SettingsMissingAfterUpsert',
  { message: Schema.String }
) {}

// Raised as a defect when the incoming request has no web `Request` source,
// which should never happen under the Workers runtime.
export class UnexpectedRequestSource extends Schema.TaggedErrorClass<UnexpectedRequestSource>()(
  'UnexpectedRequestSource',
  { message: Schema.String }
) {}

export class AssetRequestError extends Schema.TaggedErrorClass<AssetRequestError>()('AssetRequestError', {
  cause: Schema.Defect(),
}) {}
