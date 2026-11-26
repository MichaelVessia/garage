import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { Cents, IsoDate, MeterReading, NamedLink, PerformedBy } from '../Values.ts'
import { AssetId, PendingWorkId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { MeterRollback } from './MeterRollback.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'

export class PendingWorkNotOpen extends Schema.TaggedError<PendingWorkNotOpen, { readonly brand: unique symbol }>()(
  'PendingWorkNotOpen',
  { workId: PendingWorkId }
) {}

const workDetails = {
  workId: PendingWorkId,
  meterReading: Schema.optionalKey(MeterReading),
  costCents: Schema.optionalKey(Cents),
  performedBy: PerformedBy,
  vendor: Schema.optionalKey(Schema.String),
  parts: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  notes: Schema.optionalKey(Schema.String),
  links: NamedLink.pipe(Schema.Array, Schema.optionalKey),
}

export class PendingWorkCompleted extends Domain.Event('PendingWorkCompleted', {
  ...workDetails,
  title: Schema.NonEmptyString,
  completedOn: IsoDate,
  meterAdvancedTo: Schema.optionalKey(MeterReading),
}) {}

export class CompletePendingWork extends Domain.Command(
  'CompletePendingWork',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      ...workDetails,
      completedOn: Schema.optionalKey(IsoDate),
      correction: Schema.optionalKey(Schema.Boolean),
    },
    events: [PendingWorkCompleted],
    rejects: [AssetNotActive, PendingWorkNotOpen, NoMeterConfigured, MeterRollback],
  },
  { description: 'Record completion of one-time work and remove it from the pending list.' }
) {}
