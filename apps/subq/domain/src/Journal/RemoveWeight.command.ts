import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { JournalId, WeightId } from './Journal.id.ts'
import { WeightSummary } from './JournalState.ts'
import { WeightNotFound } from './WeightNotFound.rejection.ts'

export class WeightRemoved extends Domain.Event('WeightRemoved', { weightId: WeightId, ...WeightSummary.fields }) {}

export class RemoveWeight extends Domain.Command(
  'RemoveWeight',
  {
    target: JournalId,
    middleware: [Session],
    input: { weightId: WeightId },
    events: [WeightRemoved],
    rejects: [WeightNotFound],
  },
  { description: 'Remove a recorded body weight.' }
) {}
