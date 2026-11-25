import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetId, WarrantyId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class WarrantyNotFound extends Schema.TaggedError<WarrantyNotFound, { readonly brand: unique symbol }>()(
  'WarrantyNotFound',
  {
    warrantyId: WarrantyId,
  }
) {}

export class WarrantyRemoved extends Domain.Event('WarrantyRemoved', {
  warrantyId: WarrantyId,
}) {}

export class RemoveWarranty extends Domain.Command(
  'RemoveWarranty',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      warrantyId: WarrantyId,
    },
    events: [WarrantyRemoved],
    rejects: [AssetNotActive, WarrantyNotFound],
  },
  { description: 'Remove a warranty from an asset.' }
) {}
