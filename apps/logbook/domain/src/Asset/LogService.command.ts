import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { Cents, IsoDate, MeterReading, NamedLink, PerformedBy } from '../Values.ts'
import { AssetId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { MeterRollback } from './MeterRollback.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'

export class ServiceLogged extends Domain.Event('ServiceLogged', {
  title: Schema.NonEmptyString,
  performedOn: IsoDate,
  meterReading: Schema.optionalKey(MeterReading),
  costCents: Schema.optionalKey(Cents),
  performedBy: PerformedBy,
  vendor: Schema.optionalKey(Schema.String),
  parts: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  notes: Schema.optionalKey(Schema.String),
  links: NamedLink.pipe(Schema.Array, Schema.optionalKey),
  meterAdvancedTo: Schema.optionalKey(MeterReading),
}) {}

export class LogService extends Domain.Command(
  'LogService',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      title: Schema.NonEmptyString,
      performedOn: Schema.optionalKey(IsoDate),
      meterReading: Schema.optionalKey(MeterReading),
      costCents: Schema.optionalKey(Cents),
      performedBy: PerformedBy,
      vendor: Schema.optionalKey(Schema.String),
      parts: Schema.String.pipe(Schema.Array, Schema.optionalKey),
      notes: Schema.optionalKey(Schema.String),
      links: NamedLink.pipe(Schema.Array, Schema.optionalKey),
      correction: Schema.optionalKey(Schema.Boolean),
    },
    events: [ServiceLogged],
    rejects: [AssetNotActive, NoMeterConfigured, MeterRollback],
  },
  { description: 'Record service that does not belong to a maintenance schedule.' }
) {}
