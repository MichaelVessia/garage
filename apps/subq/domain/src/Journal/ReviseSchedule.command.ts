import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { InvalidSchedulePhases } from './InvalidSchedulePhases.rejection.ts'
import { JournalId, ScheduleId } from './Journal.id.ts'
import { ScheduleRevision, Schedule } from './JournalRecords.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class ScheduleRevised extends Domain.Event('ScheduleRevised', { schedule: Schedule }) {}

export class ReviseSchedule extends Domain.Command(
  'ReviseSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { scheduleId: ScheduleId, ...ScheduleRevision.fields },
    events: [ScheduleRevised],
    rejects: [ScheduleNotFound, InvalidSchedulePhases],
  },
  { description: 'Revise the details or phases of an injection schedule.' }
) {}
