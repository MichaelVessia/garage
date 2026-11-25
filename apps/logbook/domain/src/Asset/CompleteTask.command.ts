import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { Cents, IsoDate, MeterReading, NamedLink, PerformedBy } from '../Values.ts'
import { AssetId, ScheduleId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { MeterRollback } from './MeterRollback.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class TaskCompleted extends Domain.Event('TaskCompleted', {
  scheduleId: ScheduleId,
  completedOn: IsoDate,
  meterReading: Schema.optionalKey(MeterReading),
  costCents: Schema.optionalKey(Cents),
  performedBy: PerformedBy,
  vendor: Schema.optionalKey(Schema.String),
  parts: Schema.String.pipe(Schema.Array, Schema.optionalKey),
  notes: Schema.optionalKey(Schema.String),
  links: NamedLink.pipe(Schema.Array, Schema.optionalKey),
  meterAdvancedTo: Schema.optionalKey(MeterReading),
  nextDueOn: Schema.optionalKey(IsoDate),
  nextDueMeter: Schema.optionalKey(MeterReading),
}) {}

export class CompleteTask extends Domain.Command(
  'CompleteTask',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      scheduleId: ScheduleId,
      completedOn: Schema.optionalKey(IsoDate),
      meterReading: Schema.optionalKey(MeterReading),
      costCents: Schema.optionalKey(Cents),
      performedBy: PerformedBy,
      vendor: Schema.optionalKey(Schema.String),
      parts: Schema.String.pipe(Schema.Array, Schema.optionalKey),
      notes: Schema.optionalKey(Schema.String),
      links: NamedLink.pipe(Schema.Array, Schema.optionalKey),
      correction: Schema.optionalKey(Schema.Boolean),
    },
    events: [TaskCompleted],
    rejects: [AssetNotActive, NoMeterConfigured, MeterRollback, ScheduleNotFound],
  },
  { description: 'Record completed scheduled maintenance and calculate its next due thresholds.' }
) {}
