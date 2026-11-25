import * as Schema from 'effect/Schema'

export class AssetNotActive extends Schema.TaggedError<AssetNotActive, { readonly brand: unique symbol }>()(
  'AssetNotActive',
  {
    status: Schema.Literals(['unregistered', 'retired']),
  }
) {}
