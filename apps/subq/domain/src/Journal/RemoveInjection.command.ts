import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { InjectionNotFound } from './InjectionNotFound.rejection.ts'
import { JournalId, InjectionId } from './Journal.id.ts'
import { InjectionSummary } from './JournalState.ts'

export class InjectionRemoved extends Domain.Event('InjectionRemoved', {
  injectionId: InjectionId,
  ...InjectionSummary.fields,
}) {}

export class RemoveInjection extends Domain.Command(
  'RemoveInjection',
  {
    target: JournalId,
    middleware: [Session],
    input: { injectionId: InjectionId },
    events: [InjectionRemoved],
    rejects: [InjectionNotFound],
  },
  { description: 'Remove a recorded injection.' }
) {}
