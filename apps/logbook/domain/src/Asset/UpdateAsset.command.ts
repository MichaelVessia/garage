import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { AssetId } from './Asset.id.ts'
import { AssetMetadataPatch } from './AssetMetadata.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class AssetUpdated extends Domain.Event('AssetUpdated', AssetMetadataPatch.fields) {}

export class UpdateAsset extends Domain.Command(
  'UpdateAsset',
  {
    target: AssetId,
    middleware: [Session],
    input: AssetMetadataPatch.fields,
    events: [AssetUpdated],
    rejects: [AssetNotActive],
  },
  { description: 'Update an active asset’s metadata. Omit fields to keep them or pass null to clear optional fields.' }
) {}
