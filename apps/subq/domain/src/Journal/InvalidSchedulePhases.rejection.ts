import * as Schema from 'effect/Schema'

import { ScheduleId, SchedulePhaseId } from './Journal.id.ts'

export class InvalidSchedulePhases extends Schema.TaggedError<
  InvalidSchedulePhases,
  { readonly brand: unique symbol }
>()(
  'InvalidSchedulePhases',
  {
    scheduleId: ScheduleId,
    phaseId: Schema.optionalKey(SchedulePhaseId),
    reason: Schema.Literals(['empty', 'nonconsecutive-order', 'indefinite-before-final', 'duplicate-id']),
  },
  { httpApiStatus: 422 }
) {}
