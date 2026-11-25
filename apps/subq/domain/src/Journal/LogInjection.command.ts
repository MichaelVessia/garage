import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { InjectionAlreadyExists } from './InjectionAlreadyExists.rejection.ts'
import { JournalId, InjectionId } from './Journal.id.ts'
import { NewInjection, InjectionEntry } from './JournalRecords.ts'
import { InjectionSummary } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class InjectionLogged extends Domain.Event('InjectionLogged', {
  entry: InjectionEntry,
  ...InjectionSummary.fields,
}) {}

export class LogInjection extends Domain.Command(
  'LogInjection',
  {
    target: JournalId,
    middleware: [Session],
    input: { injectionId: InjectionId, ...NewInjection.fields },
    events: [InjectionLogged],
    rejects: [InjectionAlreadyExists, ScheduleNotFound],
  },
  { description: 'Record a medication injection.' }
) {}
