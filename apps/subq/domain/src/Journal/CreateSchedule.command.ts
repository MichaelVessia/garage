import * as Domain from '@alchemy.run/domain'
import * as Schema from 'effect/Schema'

import { Session } from '../Session.middleware.ts'
import { InvalidSchedulePhases } from './InvalidSchedulePhases.rejection.ts'
import { JournalId, ScheduleId } from './Journal.id.ts'
import { NewSchedule, Schedule } from './JournalRecords.ts'
import { ScheduleAlreadyExists } from './ScheduleAlreadyExists.rejection.ts'

export class ScheduleCreated extends Domain.Event('ScheduleCreated', {
  schedule: Schedule,
  deactivated: Schema.NullOr(Schedule),
}) {}

export class CreateSchedule extends Domain.Command(
  'CreateSchedule',
  {
    target: JournalId,
    middleware: [Session],
    input: { scheduleId: ScheduleId, ...NewSchedule.fields },
    events: [ScheduleCreated],
    rejects: [ScheduleAlreadyExists, InvalidSchedulePhases],
  },
  { description: 'Create and activate an injection schedule.' }
) {}
