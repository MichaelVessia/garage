import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { JournalId, ScheduleId } from './Journal.id.ts'
import { Schedule } from './JournalRecords.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class ScheduleDeactivated extends Domain.Event('ScheduleDeactivated', { schedule: Schedule }) {}

export class DeactivateSchedule extends Domain.Command(
  'DeactivateSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { scheduleId: ScheduleId },
    events: [ScheduleDeactivated],
    rejects: [ScheduleNotFound],
  },
  { description: 'Deactivate an injection schedule.' }
) {}
