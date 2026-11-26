import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { AssetId, LinkId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { LinkNotFound, LinkRemoved } from './RemoveLink.command.ts'

export class LinkAlreadyExists extends Schema.TaggedError<LinkAlreadyExists, { readonly brand: unique symbol }>()(
  'LinkAlreadyExists',
  {
    linkId: LinkId,
  }
) {}

export class LinkAttached extends Domain.Event('LinkAttached', {
  linkId: LinkId,
  label: Schema.String,
  url: Schema.String,
}) {}

export class AttachLink extends Domain.Command(
  'AttachLink',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      linkId: LinkId,
      label: Schema.String,
      url: Schema.String,
      replacesLinkId: Schema.optionalKey(LinkId),
    },
    events: [LinkRemoved, LinkAttached],
    rejects: [AssetNotActive, LinkAlreadyExists, LinkNotFound],
  },
  { description: 'Attach or replace a named reference link on an asset.' }
) {}
