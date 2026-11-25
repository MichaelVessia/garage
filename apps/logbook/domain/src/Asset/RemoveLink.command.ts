import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetId, LinkId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class LinkNotFound extends Schema.TaggedError<LinkNotFound, { readonly brand: unique symbol }>()(
  'LinkNotFound',
  {
    linkId: LinkId,
  }
) {}

export class LinkRemoved extends Domain.Event('LinkRemoved', {
  linkId: LinkId,
}) {}

export class RemoveLink extends Domain.Command(
  'RemoveLink',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      linkId: LinkId,
    },
    events: [LinkRemoved],
    rejects: [AssetNotActive, LinkNotFound],
  },
  { description: 'Remove a reference link from an asset.' }
) {}
