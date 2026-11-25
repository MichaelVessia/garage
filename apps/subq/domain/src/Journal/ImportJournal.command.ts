import * as Domain from '@alchemy.run/domain'

import { JournalSnapshot } from '../ExportFormat.ts'
import { Session } from '../Session.middleware.ts'
import { InvalidJournalSnapshot } from './InvalidJournalSnapshot.rejection.ts'
import { InvalidSchedulePhases } from './InvalidSchedulePhases.rejection.ts'
import { JournalId } from './Journal.id.ts'
import { JournalState } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class JournalImported extends Domain.Event('JournalImported', { journal: JournalState }) {}

export class ImportJournal extends Domain.Command(
  'ImportJournal',
  {
    target: JournalId,
    middleware: [Session],
    input: { snapshot: JournalSnapshot },
    events: [JournalImported],
    rejects: [InvalidJournalSnapshot, InvalidSchedulePhases, ScheduleNotFound],
  },
  { description: 'Replace all journal data with a validated snapshot.' }
) {}
