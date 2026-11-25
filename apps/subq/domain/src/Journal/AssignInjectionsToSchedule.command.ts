import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { InjectionNotFound } from './InjectionNotFound.rejection.ts'
import { JournalId, InjectionId, ScheduleId } from './Journal.id.ts'
import { InjectionEntry } from './JournalRecords.ts'
import { InjectionSummary } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class InjectionsAssignedToSchedule extends Domain.Event('InjectionsAssignedToSchedule', {
  entries: Schema.Array(InjectionEntry),
  ...InjectionSummary.fields,
}) {}

export class AssignInjectionsToSchedule extends Domain.Command(
  'AssignInjectionsToSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { injectionIds: Schema.Array(InjectionId), scheduleId: Schema.NullOr(ScheduleId) },
    events: [InjectionsAssignedToSchedule],
    rejects: [InjectionNotFound, ScheduleNotFound],
  },
  { description: 'Assign recorded injections to a schedule or clear their assignment.' }
) {}
