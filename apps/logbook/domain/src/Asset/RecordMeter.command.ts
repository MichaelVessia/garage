import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { IsoDate, MeterReading } from '../Values.ts'
import { AssetId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { MeterRollback } from './MeterRollback.rejection.ts'
import { NoMeterConfigured } from './NoMeterConfigured.rejection.ts'

export class MeterRecorded extends Domain.Event('MeterRecorded', {
  reading: MeterReading,
  recordedOn: IsoDate,
  previousReading: MeterReading,
  correction: Schema.Boolean,
}) {}

export class RecordMeter extends Domain.Command(
  'RecordMeter',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      reading: MeterReading,
      recordedOn: Schema.optionalKey(IsoDate),
      correction: Schema.optionalKey(Schema.Boolean),
    },
    events: [MeterRecorded],
    rejects: [AssetNotActive, NoMeterConfigured, MeterRollback],
  },
  { description: 'Record an asset meter reading or correct an earlier reading.' }
) {}
