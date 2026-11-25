import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { JournalId, ScheduleId, InjectionId } from './Journal.id.ts'
import { InjectionSummary } from './JournalState.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class ScheduleRemoved extends Domain.Event('ScheduleRemoved', {
  scheduleId: ScheduleId,
  unassignedInjectionIds: Schema.Array(InjectionId),
  updatedAt: Schema.DateTimeUtc,
  ...InjectionSummary.fields,
}) {}

export class RemoveSchedule extends Domain.Command(
  'RemoveSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { scheduleId: ScheduleId },
    events: [ScheduleRemoved],
    rejects: [ScheduleNotFound],
  },
  { description: 'Remove a schedule and clear its injection assignments.' }
) {}
