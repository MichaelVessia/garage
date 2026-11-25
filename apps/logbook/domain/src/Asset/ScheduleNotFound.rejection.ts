import * as Schema from 'effect/Schema'

import { ScheduleId } from './Asset.id.ts'

export class ScheduleNotFound extends Schema.TaggedError<ScheduleNotFound, { readonly brand: unique symbol }>()(
  'ScheduleNotFound',
  {
    scheduleId: ScheduleId,
  }
) {}
