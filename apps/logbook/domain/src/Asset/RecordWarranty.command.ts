import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { IsoDate } from '../Values.ts'
import { AssetId, WarrantyId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class WarrantyAlreadyExists extends Schema.TaggedError<
  WarrantyAlreadyExists,
  { readonly brand: unique symbol }
>()('WarrantyAlreadyExists', {
  warrantyId: WarrantyId,
}) {}

export class WarrantyRecorded extends Domain.Event('WarrantyRecorded', {
  warrantyId: WarrantyId,
  label: Schema.String,
  expiresOn: IsoDate,
  coverage: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
}) {}

export class RecordWarranty extends Domain.Command(
  'RecordWarranty',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      warrantyId: WarrantyId,
      label: Schema.String,
      expiresOn: IsoDate,
      coverage: Schema.optionalKey(Schema.String),
      notes: Schema.optionalKey(Schema.String),
      url: Schema.optionalKey(Schema.String),
    },
    events: [WarrantyRecorded],
    rejects: [AssetNotActive, WarrantyAlreadyExists],
  },
  { description: 'Record an asset warranty and its expiry date.' }
) {}
