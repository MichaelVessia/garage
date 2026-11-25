import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class SpecNotFound extends Schema.TaggedError<SpecNotFound, { readonly brand: unique symbol }>()(
  'SpecNotFound',
  {
    key: Schema.String,
  }
) {}

export class SpecRemoved extends Domain.Event('SpecRemoved', {
  key: Schema.String,
}) {}

export class RemoveSpec extends Domain.Command(
  'RemoveSpec',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      key: Schema.String,
    },
    events: [SpecRemoved],
    rejects: [AssetNotActive, SpecNotFound],
  },
  { description: 'Remove a named asset specification.' }
) {}
