import * as Schema from 'effect/Schema'

import { ScheduleId } from './Journal.id.ts'

export class ScheduleAlreadyExists extends Schema.TaggedError<
  ScheduleAlreadyExists,
  { readonly brand: unique symbol }
>()('ScheduleAlreadyExists', { scheduleId: ScheduleId }, { httpApiStatus: 409 }) {}
