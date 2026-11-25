import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { JournalId, ScheduleId } from './Journal.id.ts'
import { Schedule } from './JournalRecords.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class ScheduleActivated extends Domain.Event('ScheduleActivated', {
  schedule: Schedule,
  deactivated: Schema.NullOr(Schedule),
}) {}

export class ActivateSchedule extends Domain.Command(
  'ActivateSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { scheduleId: ScheduleId },
    events: [ScheduleActivated],
    rejects: [ScheduleNotFound],
  },
  { description: 'Activate one injection schedule and deactivate the previous schedule.' }
) {}
