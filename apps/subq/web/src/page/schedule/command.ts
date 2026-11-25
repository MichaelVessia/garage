import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { Schedule } from '@garage/subq-domain/Journal/JournalRecords'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import { utcToLocalDateString } from '../../lib/datetime.ts'
import { CompletedOpenScheduleForm } from './model.ts'

export const OpenScheduleForm = Command.define('OpenScheduleForm', {
  args: { schedule: Schema.NullOr(Schedule), timezone: IanaTimezone },
  messages: [CompletedOpenScheduleForm],
  execute: ({ schedule, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenScheduleForm({ schedule, todayLocal: utcToLocalDateString(now, timezone) }))
    ),
})
