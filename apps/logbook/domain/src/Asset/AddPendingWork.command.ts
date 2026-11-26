import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { IsoDate } from '../Values.ts'
import { AssetId, PendingWorkId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'

export class PendingWorkAlreadyExists extends Schema.TaggedError<
  PendingWorkAlreadyExists,
  { readonly brand: unique symbol }
>()('PendingWorkAlreadyExists', { workId: PendingWorkId }) {}

export const PendingWork = Schema.Struct({
  workId: PendingWorkId,
  title: Schema.NonEmptyString,
  notes: Schema.optionalKey(Schema.String),
  dueOn: Schema.optionalKey(IsoDate),
})

export class PendingWorkAdded extends Domain.Event('PendingWorkAdded', PendingWork.fields) {}

export class AddPendingWork extends Domain.Command(
  'AddPendingWork',
  {
    target: AssetId,
    middleware: [Session],
    input: PendingWork.fields,
    events: [PendingWorkAdded],
    rejects: [AssetNotActive, PendingWorkAlreadyExists],
  },
  { description: 'Add one-time work to an asset, with optional notes and a due date.' }
) {}
