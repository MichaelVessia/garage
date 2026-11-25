import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { InjectionNotFound } from './InjectionNotFound.rejection.ts'
import { JournalId, InjectionId } from './Journal.id.ts'
import { InjectionCorrection, InjectionEntry } from './JournalRecords.ts'
import { InjectionSummary } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class InjectionCorrected extends Domain.Event('InjectionCorrected', {
  entry: InjectionEntry,
  ...InjectionSummary.fields,
}) {}

export class CorrectInjection extends Domain.Command(
  'CorrectInjection',
  {
    target: JournalId,
    middleware: [Session],
    input: { injectionId: InjectionId, ...InjectionCorrection.fields },
    events: [InjectionCorrected],
    rejects: [InjectionNotFound, ScheduleNotFound],
  },
  { description: 'Correct a recorded injection or its details.' }
) {}
