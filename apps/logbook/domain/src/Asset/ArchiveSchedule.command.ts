import * as Domain from '@alchemy.run/domain'

import { Session } from '../Session.middleware.ts'
import { AssetId, ScheduleId } from './Asset.id.ts'
import { AssetNotActive } from './AssetNotActive.rejection.ts'
import { ScheduleNotFound } from './ScheduleNotFound.rejection.ts'

export class ScheduleArchived extends Domain.Event('ScheduleArchived', {
  scheduleId: ScheduleId,
}) {}

export class ArchiveSchedule extends Domain.Command(
  'ArchiveSchedule',
  {
    target: AssetId,
    middleware: [Session],
    input: {
      scheduleId: ScheduleId,
    },
    events: [ScheduleArchived],
    rejects: [AssetNotActive, ScheduleNotFound],
  },
  { description: 'Archive an active maintenance schedule.' }
) {}
