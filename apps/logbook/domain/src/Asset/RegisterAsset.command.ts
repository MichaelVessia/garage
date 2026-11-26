import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { MeterReading, MeterUnit } from '../Values.ts'
import { AssetId } from './Asset.id.ts'
import { AssetMetadata } from './AssetMetadata.ts'

export class AssetAlreadyRegistered extends Schema.TaggedError<
  AssetAlreadyRegistered,
  { readonly brand: unique symbol }
>()('AssetAlreadyRegistered', {
  assetId: AssetId,
}) {}

const registrationFields = {
  ...AssetMetadata.fields,
  meterUnit: Schema.optionalKey(MeterUnit),
  initialMeter: Schema.optionalKey(MeterReading),
}

export class AssetRegistered extends Domain.Event('AssetRegistered', registrationFields) {}

export class RegisterAsset extends Domain.Command(
  'RegisterAsset',
  {
    target: AssetId,
    middleware: [Session],
    input: registrationFields,
    events: [AssetRegistered],
    rejects: [AssetAlreadyRegistered],
  },
  { description: 'Register a new asset in the household.' }
) {}
