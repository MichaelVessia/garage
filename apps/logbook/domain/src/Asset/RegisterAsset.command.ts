import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetCategory, Cents, IsoDate, MeterReading, MeterUnit } from '../Values.ts'
import { AssetId } from './Asset.id.ts'

export class AssetAlreadyRegistered extends Schema.TaggedError<
  AssetAlreadyRegistered,
  { readonly brand: unique symbol }
>()('AssetAlreadyRegistered', {
  assetId: AssetId,
}) {}

export class AssetRegistered extends Domain.Event('AssetRegistered', {
  name: Schema.NonEmptyString,
  category: AssetCategory,
  make: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  serialNumber: Schema.optionalKey(Schema.String),
  purchasedOn: Schema.optionalKey(IsoDate),
  purchasePriceCents: Schema.optionalKey(Cents),
  location: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  meterUnit: Schema.optionalKey(MeterUnit),
  initialMeter: Schema.optionalKey(MeterReading),
}) {}

export class RegisterAsset extends Domain.Command(
  'RegisterAsset',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      name: Schema.NonEmptyString,
      category: AssetCategory,
      make: Schema.optionalKey(Schema.String),
      model: Schema.optionalKey(Schema.String),
      serialNumber: Schema.optionalKey(Schema.String),
      purchasedOn: Schema.optionalKey(IsoDate),
      purchasePriceCents: Schema.optionalKey(Cents),
      location: Schema.optionalKey(Schema.String),
      notes: Schema.optionalKey(Schema.String),
      meterUnit: Schema.optionalKey(MeterUnit),
      initialMeter: Schema.optionalKey(MeterReading),
    },
    events: [AssetRegistered],
    rejects: [AssetAlreadyRegistered],
  },
  { description: 'Register a new asset in the household.' }
) {}
