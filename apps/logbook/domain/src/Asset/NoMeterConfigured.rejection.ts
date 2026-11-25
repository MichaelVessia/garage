import * as Schema from 'effect/Schema'

import { AssetId } from './Asset.id.ts'

export class NoMeterConfigured extends Schema.TaggedError<NoMeterConfigured, { readonly brand: unique symbol }>()(
  'NoMeterConfigured',
  {
    assetId: AssetId,
  }
) {}
