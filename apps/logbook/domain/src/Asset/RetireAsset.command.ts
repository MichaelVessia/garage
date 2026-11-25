import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { RetirementReason } from '../Values.ts'
import { AssetId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class AssetRetired extends Domain.Event('AssetRetired', {
  reason: RetirementReason,
  notes: Schema.optionalKey(Schema.String),
}) {}

export class RetireAsset extends Domain.Command(
  'RetireAsset',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      reason: RetirementReason,
      notes: Schema.optionalKey(Schema.String),
    },
    events: [AssetRetired],
    rejects: [AssetNotActive],
  },
  { description: 'Retire an asset and stop changes to its maintenance records.' }
) {}
