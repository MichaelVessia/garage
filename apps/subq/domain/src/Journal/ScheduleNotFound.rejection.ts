import * as Schema from 'effect/Schema'

import { InjectionId, ScheduleId } from './Journal.id.ts'

export class ScheduleNotFound extends Schema.TaggedError<ScheduleNotFound, { readonly brand: unique symbol }>()(
  'ScheduleNotFound',
  { scheduleId: ScheduleId, injectionId: Schema.optionalKey(InjectionId) },
  { httpApiStatus: 404 }
) {}
