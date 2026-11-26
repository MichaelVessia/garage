import { Command } from '@effect/ui'
import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { utcToLocalDateString } from '../../lib/datetime.ts'
import { CompletedOpenScheduleForm } from './model.ts'

export const OpenScheduleForm = Command.make(
  'OpenScheduleForm',
  { args: { schedule: Schema.NullOr(Schedule), timezone: IanaTimezone } },
  ({ schedule, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenScheduleForm({ schedule, todayLocal: utcToLocalDateString(now, timezone) }))
    )
)
