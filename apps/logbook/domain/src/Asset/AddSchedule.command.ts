import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { Cadence, Cents, IsoDate, MeterReading } from '../Values.ts'
import { AssetId, ScheduleId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { MeterUnitMismatch } from './MeterUnitMismatch.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'

export class ScheduleAlreadyExists extends Schema.TaggedError<
  ScheduleAlreadyExists,
  { readonly brand: unique symbol }
>()('ScheduleAlreadyExists', {
  scheduleId: ScheduleId,
}) {}

export class ScheduleAdded extends Domain.Event('ScheduleAdded', {
  scheduleId: ScheduleId,
  title: Schema.NonEmptyString,
  cadence: Cadence,
  estimatedCostCents: Schema.optionalKey(Cents),
  notes: Schema.optionalKey(Schema.String),
  lastCompletedOn: Schema.optionalKey(IsoDate),
  lastCompletedMeter: Schema.optionalKey(MeterReading),
  nextDueOn: Schema.optionalKey(IsoDate),
  nextDueMeter: Schema.optionalKey(MeterReading),
}) {}

export class AddSchedule extends Domain.Command(
  'AddSchedule',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      scheduleId: ScheduleId,
      title: Schema.NonEmptyString,
      cadence: Cadence,
      estimatedCostCents: Schema.optionalKey(Cents),
      notes: Schema.optionalKey(Schema.String),
      lastCompletedOn: Schema.optionalKey(IsoDate),
      lastCompletedMeter: Schema.optionalKey(MeterReading),
    },
    events: [ScheduleAdded],
    rejects: [AssetNotActive, ScheduleAlreadyExists, NoMeterConfigured, MeterUnitMismatch],
  },
  { description: 'Add a maintenance schedule based on days, meter readings, or a seasonal date.' }
) {}
