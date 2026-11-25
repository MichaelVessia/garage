import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { JournalId, WeightId } from './Journal.id.ts'
import { WeightCorrection, WeightEntry } from './JournalRecords.ts'
import { WeightSummary } from './JournalState.ts'
import { WeightNotFound } from './WeightNotFound.rejection.ts'

export class WeightCorrected extends Domain.Event('WeightCorrected', { entry: WeightEntry, ...WeightSummary.fields }) {}

export class CorrectWeight extends Domain.Command(
  'CorrectWeight',
  {
    target: JournalId,
    middleware: [Session],
    input: { weightId: WeightId, ...WeightCorrection.fields },
    events: [WeightCorrected],
    rejects: [WeightNotFound],
  },
  { description: 'Correct a recorded body weight or its details.' }
) {}
