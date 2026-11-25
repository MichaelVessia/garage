import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { JournalId, WeightId } from './Journal.id.ts'
import { NewWeight, WeightEntry } from './JournalRecords.ts'
import { WeightSummary } from './JournalState.ts'
import { WeightAlreadyExists } from './WeightAlreadyExists.rejection.ts'

export class WeightRecorded extends Domain.Event('WeightRecorded', { entry: WeightEntry, ...WeightSummary.fields }) {}

export class RecordWeight extends Domain.Command(
  'RecordWeight',
  {
    target: JournalId,
    middleware: [Session],
    input: { weightId: WeightId, ...NewWeight.fields },
    events: [WeightRecorded],
    rejects: [WeightAlreadyExists],
  },
  { description: 'Record a body weight in pounds.' }
) {}
